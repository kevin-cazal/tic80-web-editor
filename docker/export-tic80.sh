#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="${1:-bin}"
OUT_DIR="${2:-/export}"

mkdir -p "$OUT_DIR"

echo "=== ${BIN_DIR} contents ==="
ls -la "$BIN_DIR" || true

copy_pair() {
  local js="$1"
  local wasm="$2"
  cp "$js" "$OUT_DIR/tic80.js"
  cp "$wasm" "$OUT_DIR/tic80.wasm"
  echo "Exported $(basename "$js") -> tic80.js"
}

patch_tic80_js() {
  local js="$OUT_DIR/tic80.js"
  [[ -f "$js" ]] || return 0

  python3 - "$js" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()

# ALLOW_MEMORY_GROWTH backs the WASM heap with a resizable ArrayBuffer, which
# Chrome/Firefox/Safari reject in TextDecoder.decode(). Emscripten no longer
# supports TEXTDECODER=0, so we rewrite the generated decode calls to copy the
# bytes into a fresh (non-resizable) buffer via .slice() before decoding.
# Matches e.g. `UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))`.
pattern = re.compile(r"(\.decode\(\s*[A-Za-z_$][\w$]*)\.subarray\(")
count = 0

def repl(m):
    global count
    count += 1
    return m.group(1) + ".slice("

patched = pattern.sub(repl, text)

# Detect any remaining risky decode-on-heap calls we failed to rewrite so CI
# fails loudly instead of shipping a broken build.
remaining = re.search(r"\.decode\(\s*[A-Za-z_$][\w$]*\.subarray\(", patched)

if count:
    path.write_text(patched)
    print(f"Patched tic80.js: TextDecoder resizable-buffer fix ({count} call(s) subarray -> slice)")
elif "TextDecoder" not in text and "UTF8Decoder" not in text:
    print("tic80.js: no TextDecoder usage found (nothing to patch)")
else:
    print("tic80.js: no `.decode(x.subarray(` pattern found; assuming already safe")

if remaining:
    raise SystemExit(
        "ERROR: tic80.js still contains a TextDecoder.decode() on a heap subarray "
        "after patching. Update patch_tic80_js in docker/export-tic80.sh."
    )
PY
}

if [[ -f "${BIN_DIR}/tic80.js" && -f "${BIN_DIR}/tic80.wasm" ]]; then
  copy_pair "${BIN_DIR}/tic80.js" "${BIN_DIR}/tic80.wasm"
elif [[ -f "${BIN_DIR}/tic80lua.js" && -f "${BIN_DIR}/tic80lua.wasm" ]]; then
  copy_pair "${BIN_DIR}/tic80lua.js" "${BIN_DIR}/tic80lua.wasm"
else
  mapfile -t js_files < <(find "$BIN_DIR" -maxdepth 1 -name 'tic80*.js' ! -name '*.worker.js' | sort)
  if [[ ${#js_files[@]} -eq 0 ]]; then
    echo "ERROR: no tic80*.js found in ${BIN_DIR}"
    exit 1
  fi
  js="${js_files[0]}"
  wasm="${js%.js}.wasm"
  if [[ ! -f "$wasm" ]]; then
    echo "ERROR: missing wasm for ${js} (expected ${wasm})"
    exit 1
  fi
  copy_pair "$js" "$wasm"
fi

patch_tic80_js

# Preload .data is optional; not all emscripten builds emit it
shopt -s nullglob
data_files=("${BIN_DIR}"/tic80*.data)
if [[ ${#data_files[@]} -gt 0 ]]; then
  cp "${data_files[0]}" "$OUT_DIR/tic80.data"
  echo "Exported $(basename "${data_files[0]}") -> tic80.data"
else
  echo "No .data preload file (optional, skipping)"
fi

echo "=== ${OUT_DIR} contents ==="
ls -la "$OUT_DIR"
