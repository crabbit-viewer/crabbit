use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use libmpv2::render::*;
use libmpv2::Mpv;

pub struct MpvPlayer {
    pub mpv: Mpv,
    pub render_ctx: Option<RenderContext>,
    pub video_server_port: u16,
    pub active: Arc<AtomicBool>,
}

unsafe impl Send for MpvPlayer {}

impl MpvPlayer {
    pub fn new(port: u16) -> Result<Self, String> {
        let mpv = Mpv::with_initializer(|init| {
            init.set_property("vo", "libmpv".to_string())?;
            init.set_property("hwdec", "auto".to_string())?;
            init.set_property("loop-file", "inf".to_string())?;
            init.set_property("keep-open", "yes".to_string())?;
            init.set_property("osd-level", 1i64)?;
            init.set_property("input-default-bindings", false)?;
            init.set_property("input-vo-keyboard", false)?;
            init.set_property("cursor-autohide", 1000i64)?;
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

    pub fn set_update_callback<F: Fn() + Send + 'static>(&mut self, callback: F) {
        if let Some(ref mut ctx) = self.render_ctx {
            ctx.set_update_callback(callback);
        }
    }

    pub fn render(&self, fbo: i32, width: i32, height: i32) -> Result<(), String> {
        if let Some(ref ctx) = self.render_ctx {
            ctx.render::<()>(fbo, width, height, true)
                .map_err(|e| format!("Render error: {:?}", e))
        } else {
            Err("Render context not initialized".to_string())
        }
    }

    pub fn load(
        &mut self,
        video_url: &str,
        audio_url: Option<&str>,
        is_gif: bool,
        muted: bool,
        volume: i64,
    ) -> Result<(), String> {
        self.mpv
            .set_property("mute", if muted || is_gif { "yes" } else { "no" }.to_string())
            .map_err(|e| format!("Failed to set mute: {:?}", e))?;
        self.mpv
            .set_property("volume", volume)
            .map_err(|e| format!("Failed to set volume: {:?}", e))?;

        self.mpv
            .command("loadfile", &[video_url, "replace"])
            .map_err(|e| format!("Failed to load file: {:?}", e))?;

        if let Some(audio) = audio_url {
            self.mpv
                .command("audio-add", &[audio, "auto"])
                .map_err(|e| format!("Failed to add audio track: {:?}", e))?;
        }

        self.active.store(true, Ordering::Relaxed);
        eprintln!("[mpv] Loaded: {} (audio: {:?}, gif: {}, muted: {}, vol: {})", video_url, audio_url, is_gif, muted, volume);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.mpv
            .command("stop", &[])
            .map_err(|e| format!("Failed to stop: {:?}", e))?;
        self.active.store(false, Ordering::Relaxed);
        eprintln!("[mpv] Stopped");
        Ok(())
    }

    pub fn set_property_string(&self, name: &str, value: &str) -> Result<(), String> {
        self.mpv
            .set_property(name, value.to_string())
            .map_err(|e| format!("Failed to set property '{}': {:?}", name, e))
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }
}
