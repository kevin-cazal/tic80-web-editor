// Vendors the Lua REPL panel: downloads a pinned release of kevin-cazal/repl_runtime (the Lua-only
// archive, ~150 KB) into public/repl/, which Vite serves at <base>/repl/ in dev and copies into
// dist/ on build.
//
// The REPL runs Lua 5.3.6 compiled to WebAssembly with the same flags and standard libraries as
// TIC-80, entirely in the browser: no server involved. To upgrade, change `replRuntime` in
// package.json (version and the archive's sha256 from the release's SHA256SUMS).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const { version, sha256 } = pkg.replRuntime;
const outDir = path.join(rootDir, 'public', 'repl');
const stamp = path.join(outDir, '.version');
const url = `https://github.com/kevin-cazal/repl_runtime/releases/download/${version}/repl_runtime-lua-${version}.tar.gz`;

if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === sha256) {
  console.log(`repl: ${version} already in public/repl/`);
  process.exit(0);
}

let archive;
try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  archive = Buffer.from(await res.arrayBuffer());
} catch (err) {
  if (fs.existsSync(path.join(outDir, 'lua', 'index.html'))) {
    console.warn(`repl: could not download ${version} (${err.message}); keeping the copy in public/repl/`);
    process.exit(0);
  }
  console.error(`repl: could not download ${url}: ${err.message}`);
  process.exit(1);
}

const actual = createHash('sha256').update(archive).digest('hex');
if (actual !== sha256) {
  console.error(`repl: checksum mismatch for ${version}\n  expected ${sha256}\n  got      ${actual}`);
  process.exit(1);
}

const tmp = path.join(os.tmpdir(), `repl-${version}-${process.pid}.tar.gz`);
fs.writeFileSync(tmp, archive);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
try {
  execFileSync('tar', ['-xzf', tmp, '-C', outDir]);
} finally {
  fs.rmSync(tmp, { force: true });
}
fs.writeFileSync(stamp, `${sha256}\n`);
console.log(`repl: ${version} -> public/repl/`);
