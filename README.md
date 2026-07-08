# TIC-80 Web Editor

A browser-based IDE with a VS Code–like layout: **TIC-80 PRO WASM** on the left and **Monaco** on the right.

**Live demo:** [https://kevin-cazal.github.io/tic80-web-editor/](https://kevin-cazal.github.io/tic80-web-editor/)

## Stack

- React + Vite + TypeScript
- [dockview](https://dockview.dev) — extensible panel layout
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — Lua editing with TIC-80 API completions
- TIC-80 PRO emscripten build — fantasy computer runtime

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

Monaco and the layout work immediately. The TIC-80 panel shows setup instructions until WASM assets are added (see below).

## TIC-80 PRO WASM setup

TIC-80 Web Editor requires a **patched** TIC-80 PRO emscripten build that exposes a small embed API for cart sync with Monaco. Stock upstream `tic80.wasm` will not work.

The Docker build applies patches from `docker/tic80/` (embed API + hooks) and enables `-DTIC80_EMBED_API=On`. Default TIC-80 ref: **`main`** (compatible with current Emscripten; older tags like `v1.1.2837` may fail on QuickJS).

```bash
docker build -f docker/tic80.Dockerfile -t tic80-web-editor-wasm .

mkdir -p public/tic80
docker run --rm -v "$PWD/public/tic80:/out" tic80-web-editor-wasm
```

Copy output into `public/tic80/`:

```
public/tic80/
  tic80.js
  tic80.wasm
  tic80.data   # optional
```

Restart the dev server and hard-refresh after rebuilding WASM.

For local dev with cache busting after a WASM rebuild:

```bash
BUILD_ID=<wasm-hash> npm run dev
```

## Docker

Two Dockerfiles: one builds patched TIC-80 PRO WASM, the other builds and serves the web app.

### 1. Build TIC-80 WASM

Compiles TIC-80 from source with emscripten (`BUILD_PRO=On`, `BUILD_WITH_ALL=On`, `TIC80_EMBED_API=On`). The first build is slow (often 20–40+ minutes) and needs several GB of disk.

```bash
docker build -f docker/tic80.Dockerfile -t tic80-web-editor-wasm .

mkdir -p public/tic80
docker run --rm -v "$PWD/public/tic80:/out" tic80-web-editor-wasm
```

Override TIC-80 version: `--build-arg TIC80_REF=v1.1.2837` (may require refreshing patches in `docker/tic80/apply-embed.sh`).

### 2. Build and serve the app

WASM artifacts must be in `public/tic80/` before building the app image.

```bash
docker build -t tic80-web-editor .
docker run --rm -p 8080:80 tic80-web-editor
```

Open http://localhost:8080

Monaco and the dockable layout work without WASM; the TIC-80 panel needs step 1.

**Container registry:** `ghcr.io/kevin-cazal/tic80-web-editor`

## Usage

- **TIC-80 (left)**: Boots like [tic80.com](https://tic80.com/) — boot animation, then CLI with version and `hello! type help for help`. Default Hello World cart is in memory; type `run` to play it.
- **Editor (right)**: Shows the **currently loaded** cart from TIC-80 (Lua, Python, etc.). Edits sync back via the embed API (debounced). Type `edit` in the TIC console to focus Monaco instead of the built-in code editor.
- **Console commands**: `new python`, `load`, `save` update Monaco automatically. Type `studio` in the TIC console to open the visual editors (sprite/map/sfx/music) and bring the TIC-80 panel forward.
- **Live resource sync**: Editing sprites, map, SFX, or music in TIC-80 updates Monaco's resource sections live (event-driven, debounced) without returning to the console; your Monaco code edits are preserved.
- Click the panel tab’s maximize button to expand a pane; TIC-80 and Editor panes cannot be closed.

## Adding new panels

The layout is registry-driven for easy extension:

1. Create `src/components/MyPanel.tsx`
2. Register in `src/layout/panelRegistry.ts`
3. Add placement in `src/layout/defaultLayout.ts`
4. Bump `LAYOUT_VERSION` in `src/layout/types.ts` if the default layout changes

Use `useLayoutApi().openPanel('myPanel')` to open panels programmatically from future UI (activity bar, command palette, etc.).

## Project structure

```
src/
  layout/          # panel registry, default layout, persistence
  components/      # EditorPanel, TicPanel
  bridge/          # TicBridge (patched WASM embed API), cartFormat
  components/      # EditorPanel, TicPanel, EditBridgeHandler
  providers/       # AppServicesProvider (shared TicBridge)
  monaco/          # TIC-80 completion provider
public/
  carts/hello.lua  # sample cart (reference only)
  tic80/           # patched WASM artifacts (Docker build)
docker/
  tic80/           # embed_api.c/h, apply-embed.sh
  tic80.Dockerfile # patched TIC-80 PRO emscripten builder
  nginx.conf       # nginx config for app image
Dockerfile         # app build + nginx serve
.github/
  actions/build-wasm/   # composite action for CI
  workflows/            # Pages + GHCR
```

## CI/CD

- **GitHub Pages** — `.github/workflows/pages.yml` builds WASM, runs `npm run build` with `VITE_BASE=/tic80-web-editor/`, and deploys to GitHub Pages.
- **GHCR** — `.github/workflows/docker.yml` publishes a Docker image with WASM baked in.

## License

MIT (application code). TIC-80 is licensed separately — see the [TIC-80 repository](https://github.com/nesbox/TIC-80).
