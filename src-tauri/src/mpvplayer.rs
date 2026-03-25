use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use libmpv2::render::*;
use libmpv2::Mpv;

/// Wraps libmpv2 with OpenGL render context for embedding in a GtkGLArea.
///
/// # Thread safety
/// - `Mpv` is Send + Sync (safe to hold in AppState behind a Mutex)
/// - `RenderContext` must be created and used on the GL thread (GTK main thread)
/// - The update callback fires from mpv's internal thread — it must not call mpv API,
///   only signal the GLArea to queue a render via glib::idle_add
pub struct MpvPlayer {
    pub mpv: Mpv,
    pub render_ctx: Option<RenderContext>,
    pub video_server_port: u16,
    pub active: Arc<AtomicBool>,
}

// RenderContext contains raw pointers, so it's !Send by default.
// We ensure all render operations happen on the GTK main thread.
unsafe impl Send for MpvPlayer {}

impl MpvPlayer {
    /// Create a new MpvPlayer. Call `init_render_context` later on the GL thread
    /// (inside the GLArea's `realize` signal).
    pub fn new(port: u16) -> Result<Self, String> {
        let mpv = Mpv::with_initializer(|init| {
            // Video output: use GPU rendering (we provide the OpenGL context)
            init.set_property("vo", "libmpv".to_string())?;
            // Hardware decoding: auto-detect (NVDEC on NVIDIA, VAAPI on AMD/Intel)
            init.set_property("hwdec", "auto".to_string())?;
            // Loop videos infinitely (matches current behavior)
            init.set_property("loop-file", "inf".to_string())?;
            // Keep mpv alive when playback ends
            init.set_property("keep-open", "yes".to_string())?;
            // Show OSD controls
            init.set_property("osd-level", 1i64)?;
            // Disable mpv's own keyboard input — Tauri handles keyboard shortcuts
            init.set_property("input-default-bindings", false)?;
            init.set_property("input-vo-keyboard", false)?;
            // Auto-hide cursor over video after 1 second
            init.set_property("cursor-autohide", 1000i64)?;
            // Idle mode: don't quit when there's nothing to play
            init.set_property("idle", "yes".to_string())?;
            Ok(())
        })
        .map_err(|e| format!("Failed to create mpv instance: {:?}", e))?;

        Ok(MpvPlayer {
            mpv,
            render_ctx: None,
            video_server_port: port,
            active: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Initialize the OpenGL render context. Must be called on the GTK main thread
    /// with a valid GL context already current (e.g., inside GLArea's `realize` signal).
    ///
    /// `get_proc_address` should resolve OpenGL function names to function pointers.
    /// On Linux with GTK3, use `epoxy_get_proc_address`.
    pub fn init_render_context(
        &mut self,
        get_proc_address: fn(ctx: &(), name: &str) -> *mut c_void,
    ) -> Result<(), String> {
        let render_ctx = RenderContext::new(
            unsafe { self.mpv.ctx.as_mut() },
            [
                RenderParam::ApiType(RenderParamApiType::OpenGl),
                RenderParam::InitParams(OpenGLInitParams {
                    get_proc_address,
                    ctx: (),
                }),
            ],
        )
        .map_err(|e| format!("Failed to create render context: {:?}", e))?;

        self.render_ctx = Some(render_ctx);
        Ok(())
    }

    /// Register the update callback. When mpv has a new frame, `on_update` is called
    /// from mpv's internal thread. It should NOT call any mpv API — only signal
    /// the GLArea to redraw (e.g., via glib::idle_add).
    pub fn set_update_callback<F: Fn() + Send + 'static>(&mut self, callback: F) {
        if let Some(ref mut ctx) = self.render_ctx {
            ctx.set_update_callback(callback);
        }
    }

    /// Render the current frame into the given FBO.
    /// Must be called on the GL thread (inside GLArea's `render` signal).
    pub fn render(&self, fbo: i32, width: i32, height: i32) -> Result<(), String> {
        if let Some(ref ctx) = self.render_ctx {
            ctx.render::<()>(fbo, width, height, true)
                .map_err(|e| format!("Render error: {:?}", e))
        } else {
            Err("Render context not initialized".to_string())
        }
    }

    /// Load a video file. Optionally set an external audio file for v.redd.it dual streams.
    pub fn load(
        &mut self,
        video_url: &str,
        audio_url: Option<&str>,
        is_gif: bool,
        muted: bool,
        volume: i64,
    ) -> Result<(), String> {
        // Set mute/volume before loading
        self.mpv
            .set_property("mute", if muted || is_gif { "yes" } else { "no" }.to_string())
            .map_err(|e| format!("Failed to set mute: {:?}", e))?;
        self.mpv
            .set_property("volume", volume)
            .map_err(|e| format!("Failed to set volume: {:?}", e))?;

        // Load the video file (replace any currently playing)
        self.mpv
            .command("loadfile", &[video_url, "replace"])
            .map_err(|e| format!("Failed to load file: {:?}", e))?;

        // Add external audio track if present (v.redd.it dual stream)
        // Must be done after loadfile, using the audio-add command
        if let Some(audio) = audio_url {
            // audio-add <url> [flags] — "auto" selects it automatically
            self.mpv
                .command("audio-add", &[audio, "auto"])
                .map_err(|e| format!("Failed to add audio track: {:?}", e))?;
        }

        self.active.store(true, Ordering::Relaxed);
        eprintln!("[mpv] Loaded: {} (audio: {:?}, gif: {}, muted: {}, vol: {})", video_url, audio_url, is_gif, muted, volume);
        Ok(())
    }

    /// Stop playback.
    pub fn stop(&mut self) -> Result<(), String> {
        self.mpv
            .command("stop", &[])
            .map_err(|e| format!("Failed to stop: {:?}", e))?;
        self.active.store(false, Ordering::Relaxed);
        eprintln!("[mpv] Stopped");
        Ok(())
    }

    /// Set a string property on mpv.
    pub fn set_property_string(&self, name: &str, value: &str) -> Result<(), String> {
        self.mpv
            .set_property(name, value.to_string())
            .map_err(|e| format!("Failed to set property '{}': {:?}", name, e))
    }

    /// Check if mpv is actively playing.
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }
}
