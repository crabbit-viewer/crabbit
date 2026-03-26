use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, Mutex};

use gtk::prelude::*;

use crate::mpvplayer::MpvPlayer;

// Video region coordinates (WebView-relative), set by frontend via mpv_reposition
static VIDEO_REL_X: AtomicI32 = AtomicI32::new(0);
static VIDEO_REL_Y: AtomicI32 = AtomicI32::new(0);
static VIDEO_W: AtomicI32 = AtomicI32::new(0);
static VIDEO_H: AtomicI32 = AtomicI32::new(0);
static VIDEO_RECT_SET: AtomicBool = AtomicBool::new(false);

/// Called from mpv_reposition IPC command to update overlay position.
pub fn reposition_overlay(rel_x: i32, rel_y: i32, w: i32, h: i32) {
    VIDEO_REL_X.store(rel_x, Ordering::Relaxed);
    VIDEO_REL_Y.store(rel_y, Ordering::Relaxed);
    VIDEO_W.store(w, Ordering::Relaxed);
    VIDEO_H.store(h, Ordering::Relaxed);
    VIDEO_RECT_SET.store(true, Ordering::Relaxed);
}

// Resolve OpenGL function pointers for mpv's render context.
use std::sync::OnceLock;

type GlGetProcFn = unsafe extern "C" fn(*const std::os::raw::c_char) -> *mut c_void;

static GL_LOADER: OnceLock<GlGetProcFn> = OnceLock::new();
struct GlHandle(*mut c_void);
unsafe impl Send for GlHandle {}
unsafe impl Sync for GlHandle {}
static LIBGL_HANDLE: OnceLock<GlHandle> = OnceLock::new();

extern "C" {
    fn dlopen(filename: *const std::os::raw::c_char, flags: i32) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const std::os::raw::c_char) -> *mut c_void;
}
const RTLD_LAZY: i32 = 0x00001;

fn init_gl_loader() -> (Option<GlGetProcFn>, GlHandle) {
    unsafe {
        let libgl = dlopen(CString::new("libGL.so.1").unwrap().as_ptr(), RTLD_LAZY);
        if !libgl.is_null() {
            let glx_get_proc = dlsym(libgl, CString::new("glXGetProcAddressARB").unwrap().as_ptr());
            if !glx_get_proc.is_null() {
                eprintln!("[mpv_gtk] Using glXGetProcAddressARB for GL function resolution");
                return (Some(std::mem::transmute(glx_get_proc)), GlHandle(libgl));
            }
        }
        let libegl = dlopen(CString::new("libEGL.so.1").unwrap().as_ptr(), RTLD_LAZY);
        if !libegl.is_null() {
            let egl_get_proc = dlsym(libegl, CString::new("eglGetProcAddress").unwrap().as_ptr());
            if !egl_get_proc.is_null() {
                eprintln!("[mpv_gtk] Using eglGetProcAddress for GL function resolution");
                return (Some(std::mem::transmute(egl_get_proc)), GlHandle(libegl));
            }
        }
        eprintln!("[mpv_gtk] WARNING: No GL proc address loader found");
        let handle = if !libgl.is_null() { libgl } else { libegl };
        (None, GlHandle(handle))
    }
}

fn get_proc_address(_ctx: &(), name: &str) -> *mut c_void {
    let cname = CString::new(name).expect("CString::new failed");
    let loader = GL_LOADER.get_or_init(|| {
        let (loader, handle) = init_gl_loader();
        LIBGL_HANDLE.get_or_init(|| handle);
        loader.unwrap_or(dummy_loader)
    });
    unsafe {
        let ptr = (loader)(cname.as_ptr());
        if !ptr.is_null() { return ptr; }
        if let Some(handle) = LIBGL_HANDLE.get() {
            if !handle.0.is_null() { return dlsym(handle.0, cname.as_ptr()); }
        }
        std::ptr::null_mut()
    }
}

unsafe extern "C" fn dummy_loader(_name: *const std::os::raw::c_char) -> *mut c_void {
    std::ptr::null_mut()
}

/// Set up mpv rendering using a borderless popup window positioned ON TOP of
/// the Tauri window's video area. The overlay covers the video region between
/// the SubredditBar and ControlBar.
pub fn setup_overlay(
    parent_window: &tauri::WebviewWindow,
    mpv_player: Arc<Mutex<Option<MpvPlayer>>>,
    visible_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    let overlay_window = gtk::Window::new(gtk::WindowType::Popup);
    overlay_window.set_decorated(false);
    overlay_window.set_skip_taskbar_hint(true);
    overlay_window.set_skip_pager_hint(true);
    overlay_window.set_accept_focus(false);
    overlay_window.set_default_size(640, 480);

    let glarea = gtk::GLArea::new();
    glarea.set_auto_render(false);
    glarea.set_hexpand(true);
    glarea.set_vexpand(true);
    overlay_window.add(&glarea);

    let needs_render = Arc::new(AtomicBool::new(false));

    // Initialize render context on GLArea realize
    let mpv_for_realize = mpv_player.clone();
    let needs_render_for_realize = needs_render.clone();
    glarea.connect_realize(move |gl| {
        eprintln!("[mpv_gtk] GLArea realized, initializing render context...");
        gl.make_current();
        if let Some(err) = gl.error() {
            eprintln!("[mpv_gtk] GLArea error: {}", err);
            return;
        }
        let _ = GL_LOADER.get_or_init(|| {
            let (loader, handle) = init_gl_loader();
            let _ = LIBGL_HANDLE.get_or_init(|| handle);
            loader.unwrap_or(dummy_loader)
        });
        let mut player = mpv_for_realize.lock().unwrap();
        if let Some(ref mut p) = *player {
            if let Err(e) = p.init_render_context(get_proc_address) {
                eprintln!("[mpv_gtk] Failed to init render context: {}", e);
            } else {
                eprintln!("[mpv_gtk] Render context initialized successfully");
                let needs_render = needs_render_for_realize.clone();
                p.set_update_callback(move || {
                    needs_render.store(true, Ordering::Relaxed);
                });
                eprintln!("[mpv_gtk] Update callback registered");
            }
        }
    });

    // Render mpv frames — query actual FBO from GTK
    type GlGetIntegervFn = unsafe extern "C" fn(pname: u32, params: *mut i32);
    const GL_FRAMEBUFFER_BINDING: u32 = 0x8CA6;

    let mpv_for_render = mpv_player.clone();
    glarea.connect_render(move |gl, _context| {
        let player = mpv_for_render.lock().unwrap();
        if let Some(ref p) = *player {
            let allocation = gl.allocation();
            let scale = gl.scale_factor();
            let width = allocation.width() * scale;
            let height = allocation.height() * scale;

            let mut fbo: i32 = 0;
            let gl_get_iv = get_proc_address(&(), "glGetIntegerv");
            if !gl_get_iv.is_null() {
                let func: GlGetIntegervFn = unsafe { std::mem::transmute(gl_get_iv) };
                unsafe { func(GL_FRAMEBUFFER_BINDING, &mut fbo) };
            }

            if let Err(e) = p.render(fbo, width, height) {
                eprintln!("[mpv_gtk] Render error: {}", e);
            }
        }
        glib::Propagation::Stop
    });

    let parent_gtk = parent_window.gtk_window()
        .map_err(|e| format!("Failed to get GTK window: {}", e))?;

    // Realize GLArea (show then hide)
    overlay_window.show_all();
    overlay_window.hide();

    // Timer: position, show/hide, and render
    let glarea_clone = glarea.clone();
    let overlay_clone = overlay_window.clone();
    let parent_clone = parent_gtk.clone();
    let visible_for_timer = visible_flag.clone();
    glib::timeout_add_local(std::time::Duration::from_millis(8), move || {
        if !parent_clone.is_visible() {
            overlay_clone.hide();
            return glib::ControlFlow::Continue;
        }

        let should_be_visible = visible_for_timer.load(Ordering::Relaxed);
        let currently_visible = overlay_clone.is_visible();

        if should_be_visible && VIDEO_RECT_SET.load(Ordering::Relaxed) {
            let (px, py) = if let Some(gdk_win) = parent_clone.window() {
                let (_, x, y) = gdk_win.origin();
                (x, y)
            } else {
                parent_clone.position()
            };
            let sx = px + VIDEO_REL_X.load(Ordering::Relaxed);
            let sy = py + VIDEO_REL_Y.load(Ordering::Relaxed);
            let sw = VIDEO_W.load(Ordering::Relaxed).max(1);
            let sh = VIDEO_H.load(Ordering::Relaxed).max(1);

            if !currently_visible {
                eprintln!("[mpv_gtk] Showing overlay: screen=({},{}) size={}x{}", sx, sy, sw, sh);
                overlay_clone.move_(sx, sy);
                overlay_clone.resize(sw, sh);
                overlay_clone.show();
            } else {
                let (cur_x, cur_y) = overlay_clone.position();
                let (cur_w, cur_h) = overlay_clone.size();
                if cur_x != sx || cur_y != sy || cur_w != sw || cur_h != sh {
                    overlay_clone.move_(sx, sy);
                    overlay_clone.resize(sw, sh);
                }
            }
        } else if !should_be_visible && currently_visible {
            overlay_clone.hide();
        }

        if needs_render.swap(false, Ordering::Relaxed) && should_be_visible {
            glarea_clone.queue_render();
        }

        glib::ControlFlow::Continue
    });

    // Force exit when parent closes
    parent_gtk.connect_destroy(move |_| {
        eprintln!("[mpv_gtk] Parent window destroyed, force exiting");
        std::process::exit(0);
    });

    eprintln!("[mpv_gtk] Overlay window setup complete");
    Ok(())
}
