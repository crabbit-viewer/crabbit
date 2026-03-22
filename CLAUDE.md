# Crabbit

Reddit media slideshow viewer — a desktop app modeled on redditp.com. Tauri v2 (Rust backend) + React/Vite/TypeScript frontend with Tailwind CSS.

## Build Environment

Claude runs in WSL2 but all tooling runs natively on Windows. Use `.exe` suffixes:

- `cargo.exe`, `rustc.exe`, `rustup.exe` — Rust toolchain
- `bun.exe` — Bun runtime (package manager + script runner)

## Build Commands

```bash
# TypeScript type check
bun.exe tsc --noEmit

# Build frontend only
bun.exe vite build

# Rust check (from project root)
cd src-tauri && cargo.exe check

# Full Tauri build (frontend + Rust + installer)
bun.exe tauri build

# Dev mode
bun.exe tauri dev
```

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

Always rebuild at the end of any code changes: `bun.exe vite build && bun.exe tauri build --no-bundle`. The first step builds the frontend into `dist/`, the second embeds it into the Rust binary producing `src-tauri/target/release/crabbit.exe`. Both steps are required — there is no `beforeBuildCommand` in tauri.conf.json so `tauri build` does NOT auto-run vite. **NEVER use `cargo.exe build` directly** — it compiles the Rust binary but does not embed the latest frontend assets. Always use `bun.exe tauri build --no-bundle` for the Rust step.

Features must be working when the user tests them. Do not rely on native browser/webview behavior for styling — Tauri uses Windows WebView2 which does not respect CSS on native form elements like `<select>`/`<option>`. Use custom components with styled divs/buttons instead. When unsure if something will render correctly, prefer fully controlled custom components over native elements.

## Testing

Test subs: `r/earthporn` (images), `r/oddlysatisfying` (v.redd.it video), `r/houseplants` (galleries), `r/earthporn+spaceporn` (multi). Check YouTube/redgifs embeds load in iframes. Verify CSP doesn't block media domains.
