// Platform detection — no longer needed for video rendering
// since Electron uses Chromium on all platforms.
// Kept for any future platform-specific needs.
export const isLinux = navigator.platform.startsWith("Linux");
