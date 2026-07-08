// Builds the HTML export payload that TIC-80's `export html` command downloads.
//
// TIC-80's web build fetches `<origin>/export/<version>/html`, expects a ZIP
// containing the standalone player runtime (index.html + tic80.js +
// tic80.wasm), then injects the current cart as `cart.tic` into that ZIP and
// hands it back to the user. Self-hosted builds have no such endpoint, so we
// generate the ZIP from our own runtime and serve it as a static file.
//
// The file is written to `public/export/<version>/html` (no extension - that is
// the exact path the WASM requests). Vite serves `public/` at the site root in
// both dev and production, so no nginx/dev-server config is required.
//
// NOTE: TIC80_EXPORT_VERSION must match the version string the WASM builds into
// its export URL: `<TIC_VERSION_MAJOR>.<TIC_VERSION_MINOR><TIC_VERSION_STATUS>`.
// For the current `main` build that is `1.2-dev`. If you rebuild the TIC-80
// WASM from a different version, update this constant (check the browser
// console: `GET /export/<version>/html`).

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const TIC80_EXPORT_VERSION = '1.2-dev';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const runtimeDir = path.join(rootDir, 'public', 'tic80');
const outDir = path.join(rootDir, 'public', 'export', TIC80_EXPORT_VERSION);
const outFile = path.join(outDir, 'html');

// Standalone player page. Mirrors TIC-80's official HTML export template: it
// sets up the global `Module` (our tic80.js is a classic, non-modularized
// Emscripten build) and boots the runtime with the injected `cart.tic`. The
// click-to-play overlay satisfies browser audio-autoplay policies.
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TIC-80 tiny computer</title>
    <style type="text/css">
        #game-frame > div { font-size: 44px; font-family: monospace; font-weight: bold; }
        .game { width: 100vw; height: 100vh; }
        /* Uncomment to remove the frame on top of the canvas and start the game directly */
        /* #game-frame { display: none; } */
    </style>
</head>
<body style="margin:0; padding:0;">
    <div class="game" style="margin: 0; position: relative; background: #1a1c2c;">
        <div id="game-frame" style="cursor: pointer; position: absolute; margin: 0 auto; opacity: 1; background: #1a1c2c; width: 100%; height: 100%;">
            <div style="text-align: center; color: white; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                <p style="margin: 0;">- CLICK TO PLAY -</p>
            </div>
        </div>
        <canvas style="width: 100%; height: 100%; margin: 0 auto; display: block; image-rendering: pixelated;" id="canvas" oncontextmenu="event.preventDefault()" onmousedown="window.focus()"></canvas>
    </div>
    <script type="text/javascript">
        // '--soft' forces TIC-80's software renderer (SDL_UpdateTexture) instead
        // of the SDL_gpu path. The GPU path uploads the framebuffer via
        // glTexSubImage2D on a WASM-heap view, which current browsers reject when
        // ALLOW_MEMORY_GROWTH backs the heap with a resizable ArrayBuffer
        // ("ArrayBufferView value must not be resizable"). This matches how the
        // editor boots the runtime. 'cart.tic' MUST be argv[1] for the loader.
        var Module = { canvas: document.getElementById('canvas'), arguments: ['cart.tic', '--soft', '--volume=15'] };

        const gameFrame = document.getElementById('game-frame');
        const displayStyle = window.getComputedStyle(gameFrame).display;

        function boot() {
            const scriptTag = document.createElement('script');
            const firstScriptTag = document.getElementsByTagName('script')[0];
            scriptTag.src = 'tic80.js';
            firstScriptTag.parentNode.insertBefore(scriptTag, firstScriptTag);
        }

        if (displayStyle === 'none') {
            boot();
        } else {
            gameFrame.addEventListener('click', function () {
                boot();
                this.remove();
            });
        }
    </script>
</body>
</html>
`;

function readRuntimeFile(name) {
  const filePath = path.join(runtimeDir, name);
  if (!fs.existsSync(filePath)) {
    console.warn(
      `[export-payload] Skipping HTML export payload: ${path.relative(rootDir, filePath)} not found.\n` +
        '  Build the TIC-80 WASM first (see README) so public/tic80/ contains tic80.js and tic80.wasm.',
    );
    return null;
  }
  return fs.readFileSync(filePath);
}

async function main() {
  const tic80js = readRuntimeFile('tic80.js');
  const tic80wasm = readRuntimeFile('tic80.wasm');
  if (!tic80js || !tic80wasm) {
    // Not a hard error: allows `npm run dev/build` to proceed before the WASM
    // has been produced. HTML export simply stays unavailable until then.
    return;
  }

  const zip = new JSZip();
  zip.file('index.html', INDEX_HTML);
  zip.file('tic80.js', tic80js);
  zip.file('tic80.wasm', tic80wasm);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, buffer);

  const kb = (buffer.length / 1024).toFixed(0);
  console.log(
    `[export-payload] Wrote ${path.relative(rootDir, outFile)} (${kb} KB) ` +
      `for TIC-80 export version ${TIC80_EXPORT_VERSION}`,
  );
}

main().catch((err) => {
  console.error('[export-payload] Failed to build HTML export payload:', err);
  process.exitCode = 1;
});
