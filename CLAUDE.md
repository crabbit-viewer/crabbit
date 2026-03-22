# Crabbit

Reddit media slideshow viewer — a desktop app modeled on redditp.com. Tauri v2 (Rust backend) + React/Vite/TypeScript frontend with Tailwind CSS.

## Build Environment

Claude runs inside a **Podman container** (Fedora-based, built from `Containerfile` in the workspace root). The host is Fedora immutable (Silverblue/Kinoite, home at `/var/home`).

**Key rules:**
- **NEVER suggest installing packages on the host or in the container at runtime.** All dependencies go in the `Containerfile` and are baked into the image at build time. If something is missing, update the `Containerfile`.
- **NEVER use `.exe` suffixes.** This is Linux, not Windows/WSL2.
- The container is ephemeral (`--rm`) — anything not on a mounted volume is lost on exit.
- **NEVER suggest the user run commands on the host** unless it's something only the host can do (e.g. updating the podman alias, adding SSH keys to GitHub). Even then, be aware that the host is immutable Fedora — no `dnf`/`apt`, use `rpm-ostree` only if truly necessary.

**Mounted volumes (persisted across container restarts):**
- `/workspace` → host `/home/user/projects` (repos live here — git repos, build artifacts all persist)
- `/root/.claude` → host `~/.claude`
- `/root/.ssh` → host `~/.ssh` (read-only)

**Not persisted:** global git config, any packages installed at runtime, anything outside the mounts above. Per-repo git config (in `.git/config`) IS persisted since repos are under `/workspace`.

Tools available in container: `cargo`, `rustc`, `rustup`, `bun`, `git`, `node`, `npm` (no `.exe` suffixes)

## Build Commands

```bash
# TypeScript type check
bun tsc --noEmit

# Build frontend only
bun vite build

# Rust check (from project root)
cd src-tauri && cargo check

# Full Tauri build with AppImage/deb/rpm bundles
NO_STRIP=true bun tauri build

# Dev mode
bun tauri dev
```

`NO_STRIP=true` is required because Fedora's libraries use `.relr.dyn` sections that linuxdeploy's bundled `strip` can't handle. `APPIMAGE_EXTRACT_AND_RUN=1` is set in the Containerfile (needed because the container has no FUSE).

Build outputs:
- `src-tauri/target/release/bundle/appimage/crabbit_<version>_amd64.AppImage`
- `src-tauri/target/release/bundle/deb/crabbit_<version>_amd64.deb`
- `src-tauri/target/release/bundle/rpm/crabbit-<version>-1.x86_64.rpm`

## Architecture

**Core principle:** Rust does all fetching, parsing, and classification. Frontend is a display layer that calls `invoke('fetch_posts')` and renders `MediaPost[]` data.

### Rust Backend (`src-tauri/src/`)

- `lib.rs` — Tauri setup, AppState (reqwest client, favorites), command registration
- `reddit/client.rs` — HTTP client, URL construction, `fetch_listing()`
- `reddit/parser.rs` — Post classification (13-step priority) + media URL extraction
- `reddit/types.rs` — `MediaPost`, `MediaItem`, `FetchResult`, `FetchParams`
- `favorites.rs` — Read/write favorites JSON in Tauri app data dir

Tauri commands: `fetch_posts`, `get_favorites`, `add_favorite`, `remove_favorite`

### Frontend (`src/`)

- `state/` — `useReducer` + Context (`AppState`, `AppDispatch`)
- `hooks/` — `useReddit` (fetch/paginate), `useSlideshow` (timer/prefetch/preload), `useKeyboard` (shortcuts)
- `components/` — `SubredditBar`, `SlideshowView`, `MediaDisplay`, `ImageSlide`, `VideoSlide`, `GallerySlide`, `EmbedSlide`, `PostOverlay`, `ControlBar`, `LoadingSpinner`, `ErrorDisplay`

## Reddit API Notes

- Uses public `.json` API, no OAuth. User-Agent: `desktop:crabbit:v0.1.0`
- **Always use `raw_json=1`** query param — prevents `&amp;` encoding in URLs
- v.redd.it audio is a separate stream: `DASH_AUDIO_128.mp4` (not all videos have audio)
- Gallery ordering comes from `gallery_data.items`, not `media_metadata` keys
- `post_hint` is unreliable — always fall back to URL/domain checks
- Use `serde_json::Value` for `media`/`preview`/`media_metadata` — Reddit's structures are too inconsistent for full typing

## Keyboard Shortcuts

Arrow keys (nav/gallery), Space (play/pause), T (overlay), F (fullscreen), M (mute), Escape (exit fullscreen)

## Workflow

Always rebuild at the end of any code changes: `NO_STRIP=true bun tauri build`. This runs vite build automatically (via `beforeBuildCommand`), then compiles the Rust binary and produces AppImage/deb/rpm bundles. **NEVER use `cargo build` directly** — it compiles the Rust binary but does not embed the latest frontend assets.

Features must be working when the user tests them. Do not rely on native browser/webview behavior for styling — Tauri's WebView may not respect CSS on native form elements like `<select>`/`<option>`. Use custom components with styled divs/buttons instead. When unsure if something will render correctly, prefer fully controlled custom components over native elements.

## Testing

Test subs: `r/earthporn` (images), `r/oddlysatisfying` (v.redd.it video), `r/houseplants` (galleries), `r/earthporn+spaceporn` (multi). Check YouTube/redgifs embeds load in iframes. Verify CSP doesn't block media domains.
