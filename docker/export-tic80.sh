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
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
old = "return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))"
new = "return UTF8Decoder.decode(heapOrArray.slice(idx,endPtr))"
if old in text:
    path.write_text(text.replace(old, new))
    print("Patched tic80.js: TextDecoder resizable-buffer fix")
elif "heapOrArray.slice(idx,endPtr)" in text:
    print("tic80.js already patched for resizable buffers")
else:
    print("tic80.js: no TextDecoder subarray pattern (TEXTDECODER=0 or unknown layout)")
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
