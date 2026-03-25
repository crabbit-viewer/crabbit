// Platform detection for conditional video rendering
// On Linux, we use libmpv instead of HTML5 <video> to avoid WebKitGTK/GStreamer issues
export const isLinux = navigator.platform.startsWith("Linux");
