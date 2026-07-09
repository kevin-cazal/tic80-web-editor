/** SWEETIE-16 default palette (16 colors × 6 hex RGB digits). */
export const SWEETIE16_PALETTE =
  '1a1c2c5d275db13e53ef7d57ffcd75a7f07038b76425717929366f3b5dc941a6f673eff7f4f4f494b0c2566c86333c57';

const RESOURCE_SECTION =
  /\n(?:<!--|\-\- <(?:PALETTE|TILES|SPRITES|MAP|SFX|MUSIC|WAVES|WAVEFORM|PATTERNS|TRACKS|FLAGS|SCREEN))/;

export interface SplitCart {
  code: string;
  resourceTail: string;
}

export function splitCart(content: string): SplitCart {
  const match = content.match(RESOURCE_SECTION);
  if (!match || match.index === undefined) {
    return { code: content.trimEnd(), resourceTail: '' };
  }

  return {
    code: content.slice(0, match.index).trimEnd(),
    resourceTail: content.slice(match.index),
  };
}

export function joinCart(code: string, resourceTail: string): string {
  const trimmedCode = code.trimEnd();
  if (!resourceTail) {
    return trimmedCode;
  }
  return `${trimmedCode}${resourceTail.startsWith('\n') ? '' : '\n'}${resourceTail}`;
}

export function defaultPaletteBlock(paletteHex: string = SWEETIE16_PALETTE): string {
  return `\n-- <PALETTE>\n-- 000:${paletteHex}\n-- </PALETTE>\n`;
}

const SCRIPT_TAG = /--\s*script:\s*(\w+)/i;

export function parseScriptLanguage(cartText: string): string {
  const match = cartText.match(SCRIPT_TAG);
  return match ? match[1].toLowerCase() : 'lua';
}

// Metadata headers use the script language's line-comment token, so accept
// Lua (--), C-style (//), shell/Python (#) and Lisp/Fennel (;) markers.
const SCRIPT_TAG_ANY = /(?:--|\/\/|#|;+)\s*script:\s*(\w+)/i;
const TITLE_TAG_ANY = /(?:--|\/\/|#|;+)\s*title:\s*(.+)/i;

export function parseScriptLanguageAny(cartText: string): string {
  const match = cartText.match(SCRIPT_TAG_ANY);
  return match ? match[1].toLowerCase() : 'lua';
}

export function parseCartTitle(cartText: string): string {
  const match = cartText.match(TITLE_TAG_ANY);
  return match ? match[1].trim() : '';
}

export function sanitizeFilename(name: string, fallback = 'cart'): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  return cleaned || fallback;
}

const EXT_TO_MONACO: Record<string, string> = {
  lua: 'lua',
  py: 'python',
  js: 'javascript',
  rb: 'ruby',
  moon: 'lua',
  fnl: 'lua',
  nut: 'lua',
  wren: 'javascript',
  wasmp: 'lua',
  janet: 'lua',
  scheme: 'scheme',
  squirrel: 'javascript',
};

export function scriptExtToMonacoLanguage(ext: string, cartText?: string): string {
  const normalized = ext.replace(/^\./, '').toLowerCase();
  if (EXT_TO_MONACO[normalized]) {
    return EXT_TO_MONACO[normalized];
  }
  if (cartText) {
    const fromTag = parseScriptLanguage(cartText);
    if (EXT_TO_MONACO[fromTag]) {
      return EXT_TO_MONACO[fromTag];
    }
    if (fromTag === 'python') {
      return 'python';
    }
    if (fromTag === 'javascript' || fromTag === 'js') {
      return 'javascript';
    }
  }
  return 'lua';
}

export function workspaceFilename(ext: string): string {
  const normalized = ext.replace(/^\./, '').toLowerCase() || 'lua';
  return `workspace.${normalized}`;
}
