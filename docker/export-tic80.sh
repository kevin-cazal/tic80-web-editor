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
# Chrome/Firefox/Safari reject in APIs like TextDecoder.decode() and the
# Blob/File constructors. Emscripten no longer supports TEXTDECODER=0, so we
# rewrite the generated calls to copy the bytes into a fresh (non-resizable)
# buffer via .slice() before use.

# 1) TextDecoder.decode(heapOrArray.subarray(idx,endPtr)) -> .slice(...)
decode_pattern = re.compile(r"(\.decode\(\s*[A-Za-z_$][\w$]*)\.subarray\(")
# 2) new Blob([HEAPU8.subarray(...)]) / new File([HEAP*.subarray(...)]) -> .slice(...)
blob_pattern = re.compile(r"(new (?:Blob|File)\(\[\s*[A-Za-z_$][\w$]*)\.subarray\(")

decode_count = 0
blob_count = 0

def decode_repl(m):
    global decode_count
    decode_count += 1
    return m.group(1) + ".slice("

def blob_repl(m):
    global blob_count
    blob_count += 1
    return m.group(1) + ".slice("

patched = decode_pattern.sub(decode_repl, text)
patched = blob_pattern.sub(blob_repl, patched)

# Detect any remaining risky heap-subarray sinks we failed to rewrite so CI
# fails loudly instead of shipping a broken build.
remaining_decode = re.search(r"\.decode\(\s*[A-Za-z_$][\w$]*\.subarray\(", patched)
remaining_blob = re.search(r"new (?:Blob|File)\(\[\s*[A-Za-z_$][\w$]*\.subarray\(", patched)

if decode_count or blob_count:
    path.write_text(patched)
    if decode_count:
        print(f"Patched tic80.js: TextDecoder resizable-buffer fix ({decode_count} call(s) subarray -> slice)")
    if blob_count:
        print(f"Patched tic80.js: Blob/File resizable-buffer fix ({blob_count} call(s) subarray -> slice)")
else:
    if "TextDecoder" not in text and "UTF8Decoder" not in text:
        print("tic80.js: no TextDecoder usage found (nothing to patch)")
    else:
        print("tic80.js: no `.decode(x.subarray(` pattern found; assuming already safe")
    print("tic80.js: no `new Blob/File([x.subarray(` pattern found; assuming already safe")

if remaining_decode:
    raise SystemExit(
        "ERROR: tic80.js still contains a TextDecoder.decode() on a heap subarray "
        "after patching. Update patch_tic80_js in docker/export-tic80.sh."
    )

if remaining_blob:
    raise SystemExit(
        "ERROR: tic80.js still contains a Blob/File constructed from a heap subarray "
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
