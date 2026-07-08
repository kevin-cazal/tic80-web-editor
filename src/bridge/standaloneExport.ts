// Assembles a single self-contained index.html that runs a TIC-80 cart directly
// from disk (file://), with no web server and no WASM rebuild.
//
// It works by eliminating the two runtime network fetches that break file://:
//   1. tic80.wasm  -> inlined and passed as Module.wasmBinary (no fetch).
//   2. cart file   -> the cart (full-fidelity project text) is written into the
//      Emscripten MEMFS during Module.preRun, and TIC-80 boots with a NON-.tic
//      positional argument (e.g. /game.lua). That path skips emsStart's
//      .tic-only preload fetch; argparse turns the positional into args.cart,
//      and (PRO build) tic_project_load restores the cart and auto-runs it.
//
// tic80.js is a non-modularized Emscripten build, so `FS` is a global once the
// script has loaded - the preRun hook can therefore call FS.writeFile directly.

export interface StandaloneExportInput {
  /** Full-fidelity TIC-80 project text (code + embedded resource sections). */
  projectText: string;
  /** Script extension without leading dot, e.g. "lua", "py", "js". */
  ext: string;
  /** Contents of tic80.js (the Emscripten runtime glue). */
  tic80Js: string;
  /** Raw bytes of tic80.wasm. */
  wasmBytes: Uint8Array;
}

function normalizeExt(ext: string): string {
  const normalized = ext.replace(/^\./, '').toLowerCase();
  // Keep it filesystem/extension safe; fall back to lua.
  return /^[a-z0-9]+$/.test(normalized) ? normalized : 'lua';
}

/** Base64-encode bytes in chunks to avoid call-stack limits on large buffers. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * Guard the IDBFS mount compiled into tic80.js's main(). Opening the exported
 * page from file:// can make IndexedDB unavailable, and an unguarded
 * FS.mount(IDBFS, ...) would throw and abort boot. A player needs no
 * persistence, so we make the mount non-fatal; FS.syncfs then no-ops and boot
 * continues.
 */
function guardIdbfsMount(tic80Js: string): string {
  const mountPattern = /FS\.mount\(\s*IDBFS\s*,\s*\{\}\s*,\s*dir\s*\)/;
  if (!mountPattern.test(tic80Js)) {
    console.warn(
      '[standaloneExport] Could not find the IDBFS mount in tic80.js to guard; ' +
        'the exported game may fail to boot from file:// if IndexedDB is unavailable.',
    );
    return tic80Js;
  }
  return tic80Js.replace(mountPattern, '(function(){try{$&}catch(_idbfsErr){}})()');
}

export function buildStandaloneHtml(input: StandaloneExportInput): string {
  const ext = normalizeExt(input.ext);
  const cartPath = `/game.${ext}`;

  const wasmB64 = bytesToBase64(input.wasmBytes);
  const cartB64 = textToBase64(input.projectText);
  const jsB64 = textToBase64(guardIdbfsMount(input.tic80Js));

  // The runtime script is kept free of any literal </script> by base64-encoding
  // the inlined tic80.js and loading it from a Blob URL.
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TIC-80 game</title>
    <style type="text/css">
        html, body { margin: 0; padding: 0; background: #1a1c2c; }
        .game { width: 100vw; height: 100vh; position: relative; }
        #game-frame {
            position: absolute; inset: 0; z-index: 2; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            background: #1a1c2c; color: #fff;
            font: bold 44px monospace;
        }
        #canvas {
            display: block; width: 100%; height: 100%; margin: 0 auto;
            image-rendering: pixelated; outline: none;
        }
    </style>
</head>
<body>
    <div class="game">
        <div id="game-frame"><p style="margin:0;">- CLICK TO PLAY -</p></div>
        <canvas id="canvas" oncontextmenu="event.preventDefault()" onmousedown="window.focus()"></canvas>
    </div>
    <script type="text/javascript">
        (function () {
            var WASM_B64 = "${wasmB64}";
            var CART_B64 = "${cartB64}";
            var JS_B64 = "${jsB64}";

            function b64ToBytes(s) {
                var bin = atob(s);
                var len = bin.length;
                var out = new Uint8Array(len);
                for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
                return out;
            }

            var WASM_BYTES = b64ToBytes(WASM_B64);

            window.Module = {
                canvas: document.getElementById('canvas'),
                // '--soft' selects the software renderer; the GPU path uploads the
                // framebuffer via glTexSubImage2D on a resizable WASM-heap view,
                // which browsers reject. 'cart' MUST be the positional argument.
                arguments: [${JSON.stringify(cartPath)}, '--soft', '--volume=15'],
                // This tic80.js was compiled without the 'wasmBinary' incoming API,
                // so instantiate the inlined bytes ourselves via instantiateWasm.
                // This hook fully bypasses tic80.js's fetch/streaming path (which
                // would otherwise try to load tic80.wasm and fail under file://).
                instantiateWasm: function (imports, successCallback) {
                    WebAssembly.instantiate(WASM_BYTES, imports)
                        .then(function (output) { successCallback(output.instance); })
                        .catch(function (e) { console.error('WASM instantiation failed', e); });
                    return {};
                },
                preRun: [function () {
                    try {
                        // FS is a global exposed by the non-modularized tic80.js.
                        FS.writeFile(${JSON.stringify(cartPath)}, b64ToBytes(CART_B64));
                    } catch (e) {
                        console.error('Failed to stage cart into MEMFS', e);
                    }
                }]
            };

            function boot() {
                var blob = new Blob([b64ToBytes(JS_B64)], { type: 'text/javascript' });
                var script = document.createElement('script');
                script.src = URL.createObjectURL(blob);
                document.body.appendChild(script);
            }

            var frame = document.getElementById('game-frame');
            frame.addEventListener('click', function () {
                frame.remove();
                boot();
            });
        })();
    </script>
</body>
</html>
`;
}
