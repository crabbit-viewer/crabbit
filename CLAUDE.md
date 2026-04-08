# Crabbit

Reddit media slideshow viewer — a desktop app modeled on redditp.com. Electron + React/Vite/TypeScript frontend with Tailwind CSS.

## Build Environment

Claude runs inside a **Podman container** (Fedora-based, built from `Containerfile` in the workspace root). The host is Fedora immutable (Silverblue/Kinoite, home at `/var/home`).

**Key rules:**
- **NEVER suggest installing packages on the host or in the container at runtime.** All dependencies go in the `Containerfile` and are baked into the image at build time. If something is missing, update the `Containerfile`.
- **NEVER use `.exe` suffixes.** This is Linux, not Windows/WSL2.
- The container is ephemeral (`--rm`) — anything not on a mounted volume is lost on exit.
- **NEVER suggest the user run commands on the host** unless it's something only the host can do (e.g. updating the podman alias, adding SSH keys to GitHub). Even then, be aware that the host is immutable Fedora — no `dnf`/`apt`, use `rpm-ostree` only if truly necessary.

**Mounted volumes (persisted across container restarts):**
- `/workspace` → host `/home/maik/projects` (repos live here — git repos, build artifacts all persist)
- `/root/.claude` → host `~/.claude`
- `/root/.ssh` → host `~/.ssh` (read-only)

**Not persisted:** global git config, any packages installed at runtime, anything outside the mounts above. Per-repo git config (in `.git/config`) IS persisted since repos are under `/workspace`.

Tools available in container: `bun`, `git`, `node`, `npm`, `npx` (no `.exe` suffixes)

## Build Commands

```bash
# TypeScript type check (frontend)
bun tsc --noEmit

# TypeScript type check (electron main process)
bun tsc -p tsconfig.electron.json --noEmit

# Build frontend only
bun vite build

# Build electron main process only
bun tsc -p tsconfig.electron.json

# Full build (frontend + electron)
bun run build

# Build + package as AppImage (what the user runs)
bun run package

# Dev mode (run vite dev server first, then electron)
# Terminal 1: bun run dev
# Terminal 2: bun run electron:dev
```

**IMPORTANT:** `bun run build` only compiles to `dist/` and `dist-electron/`. The user runs the packaged AppImage/unpacked app from `release/`, so you **must** run `bun run package` (which builds AND repackages) for changes to take effect.

Build outputs:
- `release/Crabbit-<version>.AppImage`
- `release/linux-unpacked/` (unpacked app)

## Architecture

**Core principle:** Electron main process (TypeScript) does all fetching, parsing, and classification. Frontend is a display layer that calls `invoke('fetch_posts')` via Electron IPC and renders `MediaPost[]` data.

### Electron Backend (`src-electron/`)

- `main.ts` — Electron setup, BrowserWindow, IPC handlers, protocol registration, app state
- `preload.ts` — contextBridge exposing `invoke()` to renderer
- `reddit/client.ts` — HTTP client, `fetchPosts()`, RedGifs resolution
- `reddit/parser.ts` — Post classification (13-step priority) + media URL extraction
- `reddit/types.ts` — `MediaPost`, `MediaItem`, `FetchResult`, `FetchParams`
- `video-cache.ts` — In-memory LRU cache, localhost HTTP server with Range support, `preloadVideo()`
- `favorites.ts` — Read/write favorites JSON
- `config.ts` — Config read/write, save path resolution
- `saved.ts` — Save/delete/list posts with media files

IPC commands: `fetch_posts`, `get_favorites`, `add_favorite`, `remove_favorite`, `preload_video`, `get_video_server_port`, `save_post`, `get_saved_posts`, `delete_saved_post`, `is_post_saved`, `get_save_path`, `set_save_path`, `open_save_folder`, `show_open_dialog`, `log_frontend`, `toggle_devtools`, `dump_video_cache`

### Frontend (`src/`)

- `invoke.ts` — Electron IPC bridge (drop-in replacement for Tauri's invoke)
- `state/` — `useReducer` + Context (`AppState`, `AppDispatch`)
- `hooks/` — `useReddit` (fetch/paginate), `useSlideshow` (timer/prefetch/preload), `useKeyboard` (shortcuts), `useSavedPosts`, `useIdleHide`
- `components/` — `SubredditBar`, `SlideshowView`, `MediaDisplay`, `ImageSlide`, `VideoSlide`, `GallerySlide`, `EmbedSlide`, `PostOverlay`, `ControlBar`, `LoadingSpinner`, `ErrorDisplay`, `Notification`

### Video Playback

Electron uses Chromium, so HTML5 `<video>` works on all platforms including Linux. No more WebKitGTK/GStreamer issues, no mpv overlay, no WebView reload workaround.

- Videos are preloaded and cached in-memory (LRU, 50 entries max)
- A localhost HTTP server serves cached bytes with Range request support
- Frontend sets `<video src="http://127.0.0.1:{port}/{cacheKey}">`
- Saved media files are served via `saved-media://` custom protocol

### Legacy Tauri Code (`src-tauri/`)

The old Tauri/Rust backend is preserved in `src-tauri/` for reference. It is no longer used.

## Reddit API Notes

- Uses public `.json` API, no OAuth. User-Agent: `desktop:crabbit:v0.1.0`
- **Always use `raw_json=1`** query param — prevents `&amp;` encoding in URLs
- v.redd.it audio is a separate stream: `DASH_AUDIO_128.mp4` (not all videos have audio)
- Gallery ordering comes from `gallery_data.items`, not `media_metadata` keys
- `post_hint` is unreliable — always fall back to URL/domain checks

## Keyboard Shortcuts

Arrow keys (nav/gallery), Space (play/pause), T (overlay), F (fullscreen), M (mute), Escape (exit fullscreen)

## Workflow

Always repackage at the end of any code changes: `bun run package`. This builds the Vite frontend, compiles the Electron main process, and repackages into the AppImage/unpacked app that the user actually runs.

Features must be working when the user tests them. Electron uses Chromium so standard CSS and HTML5 video work as expected.

## Testing

Test subs: `r/earthporn` (images), `r/oddlysatisfying` (v.redd.it video), `r/houseplants` (galleries), `r/earthporn+spaceporn` (multi). Check YouTube/redgifs embeds load in iframes. Verify video playback works without issues on Linux.
