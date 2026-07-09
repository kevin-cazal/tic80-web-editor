import {
  joinCart,
  parseScriptLanguage,
  parseScriptLanguageAny,
  scriptExtToMonacoLanguage,
  splitCart,
  workspaceFilename,
} from './cartFormat';
import { buildStandaloneHtml } from './standaloneExport';

export const TicEmbedReason = {
  Loaded: 1,
  Saved: 2,
  Updated: 3,
  EditRequested: 4,
  StudioRequested: 5,
} as const;

export type TicEmbedReason = (typeof TicEmbedReason)[keyof typeof TicEmbedReason];

interface EmscriptenModule {
  canvas: HTMLCanvasElement;
  arguments: string[];
  locateFile?: (path: string, scriptDirectory?: string) => string;
  preRun?: Array<() => void>;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  onAbort?: (reason: string) => void;
  onRuntimeInitialized?: () => void;
  onCartChanged?: (reason: number) => void;
  SDL2?: {
    audioContext?: AudioContext;
  };
  cwrap?: (ident: string, returnType: string | null, argTypes: string[]) => (...args: unknown[]) => unknown;
  UTF8ToString?: (ptr: number) => string;
  lengthBytesUTF8?: (str: string) => number;
  stringToUTF8?: (str: string, outPtr: number, maxBytes: number) => void;
  HEAPU8?: Uint8Array;
  HEAPU32?: Uint32Array;
  _malloc?: (size: number) => number;
  _free?: (ptr: number) => void;
  _tic80_cart_export?: (outLenPtr: number) => number;
  _tic80_cart_import?: (textPtr: number, len: number, namePtr: number) => number;
  _tic80_get_script_ext?: () => number;
}

declare global {
  interface Window {
    Module?: EmscriptenModule;
    TIC80_BOOTED?: boolean;
  }

  // eslint-disable-next-line no-var
  var ENV: Record<string, string>;
}

const TIC80_BASE_URL = `${import.meta.env.BASE_URL}tic80/`;

function withCacheBust(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${__TIC80_CACHE_BUST__}`;
}

const WASM_SCRIPT_URL = withCacheBust(`${TIC80_BASE_URL}tic80.js`);
const SYNC_DEBOUNCE_MS = 500;
const RESOURCE_SYNC_DEBOUNCE_MS = 200;
const BOOT_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TicBridge {
  private code = '';
  private resourceTail = '';
  private scriptLanguage = 'lua';
  private workspaceName = 'workspace.lua';
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private resourceSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private moduleReady = false;
  private cartLoaded = false;
  private wasmAvailable: boolean | null = null;
  private embedAvailable = false;
  private audioUnlockInstalled = false;
  private syncingFromTic = false;
  private syncingFromMonaco = false;
  private runtimeReadyResolve: (() => void) | null = null;
  private runtimeReadyPromise: Promise<void> | null = null;
  private codeListeners = new Set<(code: string) => void>();
  private languageListeners = new Set<(language: string) => void>();
  private cartLoadedListeners = new Set<(loaded: boolean) => void>();
  private editListeners = new Set<() => void>();
  private studioListeners = new Set<() => void>();

  async initialize(): Promise<void> {
    // Cart content comes from TIC-80 after boot via embed export API.
  }

  getCode(): string {
    return this.getProjectContent();
  }

  getScriptLanguage(): string {
    return this.scriptLanguage;
  }

  isCartLoaded(): boolean {
    return this.cartLoaded;
  }

  hasEmbedApi(): boolean {
    return this.embedAvailable;
  }

  /** Current script extension (e.g. "lua", "js", "py"), authoritative once booted. */
  getScriptExtension(): string {
    return this.getScriptExtFromEmbed();
  }

  /**
   * Load a full project text (code + embedded resource sections) into the editor
   * and, if TIC-80 is running, push it into the runtime. Used by "Load Code".
   */
  loadProjectText(text: string, ext?: string): void {
    const resolvedExt = (ext ?? parseScriptLanguageAny(text)).replace(/^\./, '').toLowerCase();

    const { code, resourceTail } = splitCart(text);
    this.code = code;
    this.resourceTail = resourceTail;

    this.workspaceName = workspaceFilename(resolvedExt);
    const nextLanguage = scriptExtToMonacoLanguage(resolvedExt, text);
    if (nextLanguage !== this.scriptLanguage) {
      this.scriptLanguage = nextLanguage;
      this.notifyLanguageListeners();
    }

    this.cartLoaded = true;
    this.notifyCodeListeners();
    this.notifyCartLoadedListeners();

    if (this.moduleReady && this.embedAvailable) {
      this.importCartToTic();
    }
  }

  /**
   * Build a single self-contained index.html that plays the current cart when
   * opened directly from disk (file://) - no server, no rebuild. Inlines the
   * WASM, runtime, and current cart (full-fidelity project text).
   */
  async exportStandaloneHtml(): Promise<Blob> {
    const projectText = this.getProjectContent();
    if (!projectText.trim()) {
      throw new Error('No cart loaded to export yet.');
    }

    const ext = this.getScriptExtFromEmbed();

    const [tic80Js, wasmBytes] = await Promise.all([
      fetch(withCacheBust(`${TIC80_BASE_URL}tic80.js`)).then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch tic80.js (${res.status})`);
        }
        return res.text();
      }),
      fetch(withCacheBust(`${TIC80_BASE_URL}tic80.wasm`)).then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch tic80.wasm (${res.status})`);
        }
        return new Uint8Array(await res.arrayBuffer());
      }),
    ]);

    const html = buildStandaloneHtml({ projectText, ext, tic80Js, wasmBytes });
    return new Blob([html], { type: 'text/html' });
  }

  onCodeChange(listener: (code: string) => void): () => void {
    this.codeListeners.add(listener);
    return () => this.codeListeners.delete(listener);
  }

  onLanguageChange(listener: (language: string) => void): () => void {
    this.languageListeners.add(listener);
    return () => this.languageListeners.delete(listener);
  }

  onCartLoadedChange(listener: (loaded: boolean) => void): () => void {
    this.cartLoadedListeners.add(listener);
    return () => this.cartLoadedListeners.delete(listener);
  }

  onEditRequested(listener: () => void): () => void {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  onStudioRequested(listener: () => void): () => void {
    this.studioListeners.add(listener);
    return () => this.studioListeners.delete(listener);
  }

  async checkWasmAvailable(): Promise<boolean> {
    if (this.wasmAvailable !== null) {
      return this.wasmAvailable;
    }

    try {
      const response = await fetch(WASM_SCRIPT_URL, { method: 'HEAD' });
      this.wasmAvailable = response.ok;
    } catch {
      this.wasmAvailable = false;
    }

    return this.wasmAvailable;
  }

  isModuleReady(): boolean {
    return this.moduleReady;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  unlockAudio(): void {
    const ctx = window.Module?.SDL2?.audioContext;
    if (ctx?.state === 'suspended') {
      void ctx.resume();
    }
  }

  private installAudioUnlock(canvas: HTMLCanvasElement): void {
    if (this.audioUnlockInstalled) {
      return;
    }
    this.audioUnlockInstalled = true;

    const resume = () => this.unlockAudio();
    canvas.addEventListener('click', resume);
    canvas.addEventListener('keydown', resume);
    document.addEventListener('keydown', resume);
  }

  syncCode(nextCart: string): void {
    if (this.syncingFromTic) {
      return;
    }

    const { code, resourceTail } = splitCart(nextCart);
    this.code = code;
    this.resourceTail = resourceTail;
    this.notifyCodeListeners();

    if (!this.moduleReady || !this.embedAvailable) {
      return;
    }

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      this.importCartToTic();
    }, SYNC_DEBOUNCE_MS);
  }

  private notifyCodeListeners(): void {
    const cartText = this.getProjectContent();
    for (const listener of this.codeListeners) {
      listener(cartText);
    }
  }

  private notifyLanguageListeners(): void {
    for (const listener of this.languageListeners) {
      listener(this.scriptLanguage);
    }
  }

  private notifyCartLoadedListeners(): void {
    for (const listener of this.cartLoadedListeners) {
      listener(this.cartLoaded);
    }
  }

  private notifyEditListeners(): void {
    for (const listener of this.editListeners) {
      listener();
    }
  }

  private notifyStudioListeners(): void {
    for (const listener of this.studioListeners) {
      listener();
    }
  }

  private getProjectContent(): string {
    return joinCart(this.code, this.resourceTail);
  }

  private createPreRunHooks(): () => void {
    return () => {
      if (typeof ENV !== 'undefined') {
        ENV.SDL_EMSCRIPTEN_KEYBOARD_ELEMENT = '#canvas';
      }
    };
  }

  private ensureRuntimeReadyPromise(): Promise<void> {
    if (!this.runtimeReadyPromise) {
      this.runtimeReadyPromise = new Promise((resolve) => {
        this.runtimeReadyResolve = resolve;
      });
    }
    return this.runtimeReadyPromise;
  }

  private markRuntimeReady(): void {
    this.runtimeReadyResolve?.();
    this.runtimeReadyResolve = null;
  }

  private async waitForRuntimeReady(): Promise<void> {
    if (typeof window.Module?._tic80_cart_export === 'function') {
      return;
    }
    await this.ensureRuntimeReadyPromise();
  }

  private bindEmbedApi(): void {
    const mod = window.Module;
    this.embedAvailable = typeof mod?._tic80_cart_export === 'function';

    if (!this.embedAvailable) {
      return;
    }

    mod!.onCartChanged = (reason: number) => {
      void this.handleCartChanged(reason);
    };
  }

  private getScriptExtFromEmbed(): string {
    const mod = window.Module;
    if (typeof mod?._tic80_get_script_ext === 'function') {
      const ptr = mod._tic80_get_script_ext();
      if (ptr && mod.UTF8ToString) {
        return mod.UTF8ToString(ptr);
      }
    }
    return parseScriptLanguage(this.getProjectContent());
  }

  private updateLanguageFromCart(cartText: string): void {
    const ext = this.getScriptExtFromEmbed();
    this.workspaceName = workspaceFilename(ext);
    const nextLanguage = scriptExtToMonacoLanguage(ext, cartText);
    if (nextLanguage !== this.scriptLanguage) {
      this.scriptLanguage = nextLanguage;
      this.notifyLanguageListeners();
    }
  }

  private applyCartText(cartText: string): void {
    const { code, resourceTail } = splitCart(cartText);
    this.code = code;
    this.resourceTail = resourceTail;
    this.updateLanguageFromCart(cartText);
    this.cartLoaded = true;
    this.notifyCodeListeners();
    this.notifyCartLoadedListeners();
  }

  private pullCartFromEmbed(): boolean {
    const mod = window.Module;
    if (!mod?._tic80_cart_export || !mod._malloc || !mod._free) {
      return false;
    }

    const lenPtr = mod._malloc(4);
    try {
      const textPtr = mod._tic80_cart_export(lenPtr);
      if (!textPtr) {
        return false;
      }

      const heapU32 = mod.HEAPU32 ?? (mod.HEAPU8 ? new Uint32Array(mod.HEAPU8.buffer) : undefined);
      const byteLen = heapU32 ? heapU32[lenPtr >> 2] : 0;
      let cartText: string;
      if (mod.UTF8ToString) {
        cartText = mod.UTF8ToString(textPtr);
      } else if (byteLen > 0 && mod.HEAPU8) {
        // slice() copies into a non-resizable buffer; TextDecoder rejects WASM heap views.
        cartText = new TextDecoder().decode(mod.HEAPU8.slice(textPtr, textPtr + byteLen));
      } else {
        return false;
      }

      if (!cartText.trim()) {
        return false;
      }

      this.syncingFromTic = true;
      try {
        this.applyCartText(cartText);
      } finally {
        this.syncingFromTic = false;
      }

      return true;
    } finally {
      mod._free(lenPtr);
    }
  }

  /**
   * Pull only the resource sections (sprites/map/sfx/music/etc.) from TIC-80,
   * keeping the code currently held from Monaco. Resource edits never change the
   * code section, so this avoids clobbering un-synced Monaco keystrokes.
   */
  private pullResourcesFromEmbed(): boolean {
    const mod = window.Module;
    if (!mod?._tic80_cart_export || !mod._malloc || !mod._free) {
      return false;
    }

    const lenPtr = mod._malloc(4);
    try {
      const textPtr = mod._tic80_cart_export(lenPtr);
      if (!textPtr) {
        return false;
      }

      const heapU32 = mod.HEAPU32 ?? (mod.HEAPU8 ? new Uint32Array(mod.HEAPU8.buffer) : undefined);
      const byteLen = heapU32 ? heapU32[lenPtr >> 2] : 0;
      let cartText: string;
      if (mod.UTF8ToString) {
        cartText = mod.UTF8ToString(textPtr);
      } else if (byteLen > 0 && mod.HEAPU8) {
        cartText = new TextDecoder().decode(mod.HEAPU8.slice(textPtr, textPtr + byteLen));
      } else {
        return false;
      }

      if (!cartText.trim()) {
        return false;
      }

      const { resourceTail } = splitCart(cartText);
      if (resourceTail === this.resourceTail) {
        return false;
      }

      this.syncingFromTic = true;
      try {
        this.resourceTail = resourceTail;
        this.notifyCodeListeners();
      } finally {
        this.syncingFromTic = false;
      }

      return true;
    } finally {
      mod._free(lenPtr);
    }
  }

  private async pullCartWithRetry(attempts = 12, delayMs = 250): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (this.pullCartFromEmbed()) {
        return true;
      }
      await sleep(delayMs);
    }
    return false;
  }

  private importCartToTic(): void {
    const mod = window.Module;
    if (
      !mod?._tic80_cart_import ||
      !mod._malloc ||
      !mod._free ||
      !mod.lengthBytesUTF8 ||
      !mod.stringToUTF8
    ) {
      return;
    }

    const cart = this.getProjectContent();
    const len = mod.lengthBytesUTF8(cart);
    const textPtr = mod._malloc(len + 1);
    const namePtr = mod._malloc(mod.lengthBytesUTF8(this.workspaceName) + 1);

    try {
      mod.stringToUTF8(cart, textPtr, len + 1);
      mod.stringToUTF8(this.workspaceName, namePtr, mod.lengthBytesUTF8(this.workspaceName) + 1);

      this.syncingFromMonaco = true;
      try {
        mod._tic80_cart_import(textPtr, len, namePtr);
      } finally {
        this.syncingFromMonaco = false;
      }
    } finally {
      mod._free(textPtr);
      mod._free(namePtr);
    }
  }

  private async handleCartChanged(reason: number): Promise<void> {
    if (reason === TicEmbedReason.StudioRequested) {
      this.notifyStudioListeners();
      return;
    }

    if (this.syncingFromMonaco) {
      return;
    }

    if (reason === TicEmbedReason.EditRequested) {
      this.pullCartFromEmbed();
      this.notifyEditListeners();
      return;
    }

    if (reason === TicEmbedReason.Updated) {
      // Coalesce frequent resource-edit notifications (e.g. waveform drags).
      if (this.resourceSyncTimer) {
        clearTimeout(this.resourceSyncTimer);
      }
      this.resourceSyncTimer = setTimeout(() => {
        this.resourceSyncTimer = null;
        if (!this.syncingFromMonaco) {
          this.pullResourcesFromEmbed();
        }
      }, RESOURCE_SYNC_DEBOUNCE_MS);
      return;
    }

    await sleep(0);
    this.pullCartFromEmbed();
  }

  private waitForBoot(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error('TIC-80 did not finish booting in time'));
      }, BOOT_TIMEOUT_MS);

      const previousPrint = window.Module?.print;
      if (!window.Module) {
        reject(new Error('TIC-80 Module was not initialized'));
        return;
      }

      const onBootOutput = (text: string) => {
        if (text.includes('hello!') || text.includes('type help')) {
          finish();
        }
      };

      window.Module.print = (text: string) => {
        previousPrint?.(text);
        onBootOutput(text);
      };

      const previousPrintErr = window.Module.printErr;
      window.Module.printErr = (text: string) => {
        previousPrintErr?.(text);
        onBootOutput(text);
      };
    });
  }

  async loadWasm(canvas: HTMLCanvasElement): Promise<void> {
    const available = await this.checkWasmAvailable();
    if (!available) {
      throw new Error('TIC-80 WASM assets not found. See README for build instructions.');
    }

    this.canvas = canvas;
    this.installAudioUnlock(canvas);
    this.unlockAudio();

    if (window.TIC80_BOOTED) {
      this.bindEmbedApi();
      if (!this.embedAvailable) {
        throw new Error(
          'TIC-80 WASM is missing the embed API. Rebuild with docker/tic80.Dockerfile.',
        );
      }
      this.moduleReady = true;
      await this.pullCartWithRetry();
      return;
    }

    this.ensureRuntimeReadyPromise();

    window.Module = {
      canvas,
      arguments: ['--soft', '--volume=15'],
      locateFile: (path: string) => withCacheBust(`${TIC80_BASE_URL}${path}`),
      print: (text: string) => {
        if (text.trim()) {
          console.log('[TIC-80]', text);
        }
      },
      printErr: (text: string) => console.warn('[TIC-80]', text),
      onAbort: (reason: string) => console.error('[TIC-80 abort]', reason),
      onRuntimeInitialized: () => {
        this.unlockAudio();
        this.markRuntimeReady();
      },
      preRun: [this.createPreRunHooks()],
    };

    const bootPromise = this.waitForBoot();

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src^="${TIC80_BASE_URL}tic80.js"]`,
    );
    if (existingScript) {
      throw new Error('TIC-80 WASM already loaded. Refresh the page to retry.');
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = WASM_SCRIPT_URL;
      script.async = true;
      script.onerror = () => reject(new Error(`Failed to load ${WASM_SCRIPT_URL}`));
      script.onload = () => resolve();
      document.body.appendChild(script);
    });

    await this.waitForRuntimeReady();
    this.bindEmbedApi();

    if (!this.embedAvailable) {
      throw new Error(
        'TIC-80 WASM is missing the embed API. Rebuild with docker/tic80.Dockerfile.',
      );
    }

    await bootPromise;
    await sleep(200);

    if (!(await this.pullCartWithRetry())) {
      console.warn('Could not export cart from TIC-80');
    }

    this.moduleReady = true;
    window.TIC80_BOOTED = true;
    this.unlockAudio();
  }
}
