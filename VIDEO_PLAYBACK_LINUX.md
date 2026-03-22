# Video Playback on Linux (WebKitGTK) — Investigation Summary

## The Problem

Video playback (primarily redgifs H.264 MP4 files) fails on Linux in various ways. The app works perfectly on Windows where Tauri uses Edge/Chromium (WebView2) with Media Foundation for decoding. On Linux, Tauri uses WebKitGTK which relies on GStreamer for all media playback.

## System Under Test

- **Host**: Bazzite (Fedora Atomic/ublue gaming distro)
- **GPU**: NVIDIA GeForce RTX 3080
- **Available GStreamer H.264 decoders**:
  - `nvh264dec` — NVIDIA CUDA hardware decoder (outputs CUDA memory)
  - `vulkanh264dec` — Vulkan decoder on NVIDIA
  - `avdec_h264` — ffmpeg/libav software decoder
- **WebKitGTK**: Uses GStreamer internally for `<video>` playback
- **Build environment**: Podman container (Fedora), Tauri v2, React/TypeScript frontend

## Approaches Tried

### 1. Direct URLs (`<video src="https://v.redd.it/...">`)
- **Result**: Error code 4 (`MEDIA_ERR_SRC_NOT_SUPPORTED`)
- **Cause**: CORS — v.redd.it doesn't serve proper headers for WebView cross-origin requests

### 2. Custom URI Scheme Protocol (`media-proxy://localhost/...`)
- **Result**: Error code 4
- **Cause**: WebKitGTK does not support custom URI schemes for `<video>` elements. The protocol handler fires (confirmed via logs) and serves correct data, but the video element can't consume it.
- Tried both `http://media-proxy.localhost/` and `media-proxy://localhost/` formats.

### 3. Localhost HTTP Server (raw TCP, then hyper, then keep-alive)
- **Result**: Perfect video quality, no artifacts, no decode errors
- **But**: UI freezes after ~4-20 videos depending on configuration
- **Root cause identified via GStreamer debug logs**:
  - `nvh264dec` decodes to `video/x-raw(memory:CUDAMemory)`
  - WebKitGTK's `videobalance` element cannot transform CUDA memory: `transform could not transform video/x-raw(memory:CUDAMemory)...`
  - GStreamer pipeline enters a broken state with `appsrc0` repeatedly creating random stream-ids in an infinite loop
  - WebKitWebProcess eventually hangs (not crashes — the X button still works)
- Connection handling variations tried: `Connection: close`, HTTP keep-alive, hyper framework, raw TCP — no difference. The freeze is inside WebKitGTK/GStreamer, not in our server.

### 4. Blob URLs (`blob:tauri://localhost/...`)
- **Transfer methods tested**:
  - Base64 via JSON IPC (`(String, String)` tuple) — potential corruption for 10-20MB payloads
  - Raw bytes via `tauri::ipc::Response` (ArrayBuffer) — no corruption
- **Result with nvh264dec enabled**: Videos play but with **green artifacts** for 2-3 seconds at the start of every video. No freezes.
- **Result with nvh264dec disabled**: `avdec_h264` reports `Invalid input packet` and fails after ~1 second. Every video fails with Code 3: `Media failed to decode: Failed to send data for decoding`. The ffmpeg decoder on Bazzite appears unable to handle these H.264 High Profile Level 5 streams via blob URLs.
- **Result with vulkanh264dec forced**: Instant Code 4 errors. Vulkan decoder doesn't work with blob URLs at all.
- Green artifact cause: CUDA memory from nvh264dec — same root cause as the localhost freeze, but manifests differently with blob URLs.

### 5. Disabling Problematic GStreamer Elements
- **`GST_PLUGIN_FEATURE_RANK=nvh264dec:0,nvh264sldec:0`**: Disabling NVIDIA decoders causes all videos to fail because `avdec_h264` rejects the packets as invalid.
- **`GST_PLUGIN_FEATURE_RANK=videobalance:0`**: Disabling the problematic transform element — artifacts remain, no improvement.
- **`GST_GL_API=opengl`**: No effect on CUDA memory handling.

### 6. MP4 Faststart (moov atom reordering)
- Implemented in Rust to move the moov atom before mdat
- **Result**: Videos already had moov first — no rearrangement needed. Not the cause of artifacts.

### 7. AppImage with Bundled GStreamer (`bundleMediaFramework: true`)
- Bundles `libgstlibav.so` (avdec_h264) and `libgstopenh264.so` into the AppImage
- **Result**: WebKitWebProcess still loads the **host's** GStreamer plugins (including nvh264dec from NVIDIA drivers), ignoring the bundled ones. Same CUDA memory issue persists.

### 8. WebView Reload After N Videos
- Save app state to `sessionStorage`, reload WebView to reset GStreamer, restore state
- **Problems**:
  - Reload after every video: infinite reload loop when consecutive posts are videos
  - Reload after N videos (2-5): state restoration works but index tracking is fragile, and the freeze threshold is unpredictable (varies between 4-20 videos)

## Root Cause

**NVIDIA's `nvh264dec` GStreamer element outputs decoded frames in CUDA memory (`video/x-raw(memory:CUDAMemory)`)**. WebKitGTK's internal video pipeline includes a `videobalance` element that cannot handle CUDA memory and fails to transform it. This causes:

1. **With localhost HTTP**: GStreamer pipeline deadlocks after several videos, freezing the WebKitWebProcess
2. **With blob URLs**: Green artifacts as the pipeline struggles with CUDA→display conversion, but no freeze
3. **Disabling nvh264dec**: The only alternative decoder (`avdec_h264`) rejects these H.264 High Profile Level 5 streams as invalid packets when fed via blob URLs

This is fundamentally a **WebKitGTK + NVIDIA GStreamer integration bug**. It does not occur on Windows (Chromium/Media Foundation) or on systems without NVIDIA GPUs.

## Possible Future Solutions

1. **Electron**: Replace Tauri's WebKitGTK with Chromium which handles video natively. The Rust backend could be kept as a sidecar process. Estimated 2-3 days.

2. **Embedded mpv**: Use libmpv or mpv subprocess for video playback only, bypassing GStreamer/WebKitGTK entirely. mpv handles NVIDIA perfectly. Seamless integration requires libmpv bindings (2-3 days); separate window approach is simpler (hours) but noticeable UX change.

3. **Wait for WebKitGTK/GStreamer fixes**: The CUDA memory handling in WebKitGTK's pipeline may improve in future versions. The `videobalance` element may gain CUDA memory support, or WebKitGTK may insert automatic `cudadownload` elements.

4. **Force software decoding at the system level**: If a future `avdec_h264` version handles these streams correctly, `GST_PLUGIN_FEATURE_RANK=nvh264dec:0` would be a one-line fix.

## Files Modified During Investigation

### Rust Backend (`src-tauri/src/`)
- `main.rs` — GStreamer env vars, DMABUF workaround, `--verbose` flag
- `lib.rs` — Video cache, `preload_video`, `fetch_video_bytes`, `get_video_url`, `reload_webview`, `log_frontend` commands, media-proxy protocol handler, localhost video server setup
- `videoserver.rs` — Local HTTP server for video serving (raw TCP with keep-alive)
- `faststart.rs` — MP4 moov atom reordering (unused — videos already faststart)
- `reddit/client.rs` — RedGifs proxy URL generation
- `reddit/parser.rs` — Debug logging for video posts

### Frontend (`src/`)
- `components/VideoSlide.tsx` — Multiple approaches: direct URL, proxy URL, blob URL, localhost URL, video cleanup, reload logic
- `components/MediaDisplay.tsx` — Slide logging, reload-after-video logic
- `state/reducer.ts` — State persistence to sessionStorage for reload recovery

### Build/Config
- `Containerfile` — Added `gstreamer1-plugin-openh264`, `gstreamer1-plugin-libav`
- `tauri.conf.json` — CSP updates for media-proxy, saved-media, localhost, blob schemes
- `Cargo.toml` — Added base64, hyper, hyper-util, http-body-util, sha2, hex dependencies
