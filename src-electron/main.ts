import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  protocol,
  session,
  shell,
  dialog,
} from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "path";
import * as fs from "fs";
import { fetchPosts } from "./reddit/client";
import { VideoCache, startVideoServer, preloadVideo, urlToCacheKey } from "./video-cache";
import * as favorites from "./favorites";
import * as ignoredUsersModule from "./ignored-users";
import * as config from "./config";
import * as saved from "./saved";

let mainWindow: BrowserWindow | null = null;

const videoCache = new VideoCache();
let videoServerPort = 0;

// App data paths (initialized after app.ready)
let appDataDir: string;
let favPath: string;
let cfgPath: string;
let ignoredPath: string;
let favs: string[] = [];
let ignoredUsers: string[] = [];
let savePath: string;
let savedIds: Set<string> = new Set();

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Register custom scheme before app.ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "saved-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Crabbit",
    backgroundColor: "#121218",
    autoHideMenuBar: true,
    icon: (() => {
      const iconPath = path.join(process.resourcesPath || path.join(__dirname, ".."), "icon.png");
      console.log("[icon] Loading from:", iconPath, "exists:", fs.existsSync(iconPath));
      const img = nativeImage.createFromPath(iconPath);
      console.log("[icon] Loaded size:", img.getSize());
      return img;
    })(),
  });

  // Dev mode: load Vite dev server; Prod: load built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Open external links (window.open) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupIPC(): void {
  ipcMain.handle("fetch_posts", async (_event, args) => {
    return fetchPosts(args.params, mainWindow);
  });

  ipcMain.handle("get_favorites", async () => {
    return favs;
  });

  ipcMain.handle("add_favorite", async (_event, args) => {
    const subLower = args.subreddit.toLowerCase();
    if (!favs.some((f) => f.toLowerCase() === subLower)) {
      favs.push(args.subreddit);
      favorites.writeFavorites(favPath, favs);
    }
  });

  ipcMain.handle("remove_favorite", async (_event, args) => {
    const subLower = args.subreddit.toLowerCase();
    favs = favs.filter((f) => f.toLowerCase() !== subLower);
    favorites.writeFavorites(favPath, favs);
  });

  ipcMain.handle("get_ignored_users", async () => {
    return ignoredUsers;
  });

  ipcMain.handle("add_ignored_user", async (_event, args) => {
    const userLower = args.username.toLowerCase();
    if (!ignoredUsers.some((u) => u.toLowerCase() === userLower)) {
      ignoredUsers.push(args.username);
      ignoredUsersModule.writeIgnoredUsers(ignoredPath, ignoredUsers);
    }
  });

  ipcMain.handle("remove_ignored_user", async (_event, args) => {
    const userLower = args.username.toLowerCase();
    ignoredUsers = ignoredUsers.filter((u) => u.toLowerCase() !== userLower);
    ignoredUsersModule.writeIgnoredUsers(ignoredPath, ignoredUsers);
  });

  ipcMain.handle("preload_video", async (_event, args) => {
    const url: string = args.url;

    // Handle saved-media:// URLs by reading directly from disk
    if (url.startsWith("saved-media://")) {
      const key = urlToCacheKey(url);
      if (videoCache.has(key)) {
        videoCache.touch(key);
        return key;
      }
      const parsed = new URL(url);
      const decodedPath = decodeURIComponent(parsed.pathname.slice(1));
      const filePath = path.join(savePath, decodedPath);
      const bytes = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "video/mp4";
      videoCache.insert(key, bytes, contentType);
      return key;
    }

    return preloadVideo(videoCache, url);
  });

  ipcMain.handle("get_video_server_port", () => {
    return videoServerPort;
  });

  ipcMain.handle("dump_video_cache", async () => {
    const tmpDir = process.env.TMPDIR || "/tmp";
    const paths: string[] = [];
    // Access internal state for debug dump
    const cache = videoCache as any;
    for (const [key, entry] of cache.entries) {
      const ext = entry.contentType.includes("mp4") ? "mp4" : "webm";
      const filePath = path.join(
        tmpDir,
        `crabbit_cache_${key.slice(0, 8)}_${entry.bytes.length}.${ext}`
      );
      fs.writeFileSync(filePath, entry.bytes);
      paths.push(
        `${filePath} (${entry.bytes.length} bytes, ${entry.contentType})`
      );
    }
    console.error(`[dump] Wrote ${paths.length} cached videos to ${tmpDir}`);
    return paths;
  });

  ipcMain.handle("save_post", async (_event, args) => {
    const meta = await saved.savePost(savePath, args.post);
    savedIds.add(args.post.id);
    return meta;
  });

  ipcMain.handle("get_saved_posts", async () => {
    return saved.listSavedPosts(savePath);
  });

  ipcMain.handle("delete_saved_post", async (_event, args) => {
    saved.deleteSavedPost(savePath, args.subreddit, args.postId);
    savedIds.delete(args.postId);
  });

  ipcMain.handle("is_post_saved", async (_event, args) => {
    return savedIds.has(args.postId);
  });

  ipcMain.handle("get_save_path", async () => {
    return savePath;
  });

  ipcMain.handle("get_sort_preference", async () => {
    const cfg = config.readConfig(cfgPath);
    return { sort: cfg.sort || "hot", time_range: cfg.time_range || "day" };
  });

  ipcMain.handle("set_sort_preference", async (_event, args) => {
    const cfg = config.readConfig(cfgPath);
    cfg.sort = args.sort;
    cfg.time_range = args.time_range;
    config.writeConfig(cfgPath, cfg);
  });

  ipcMain.handle("set_save_path", async (_event, args) => {
    savePath = args.path;
    const cfg = config.readConfig(cfgPath);
    cfg.save_path = args.path;
    config.writeConfig(cfgPath, cfg);
    savedIds = saved.loadSavedIds(savePath);
  });

  ipcMain.handle("open_save_folder", async () => {
    fs.mkdirSync(savePath, { recursive: true });
    shell.openPath(savePath);
  });

  ipcMain.handle("show_open_dialog", async (_event, args) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: args?.properties ?? ["openDirectory"],
      title: args?.title ?? "Select folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("log_frontend", (_event, args) => {
    console.error(`[frontend:${args.level}] ${args.msg}`);
  });

  ipcMain.handle("open_url", async (_event, args) => {
    console.error("[open_url] received:", JSON.stringify(args));
    try {
      await shell.openExternal(args.url);
      console.error("[open_url] opened successfully");
    } catch (e) {
      console.error("[open_url] shell.openExternal failed:", e);
      throw e;
    }
  });

  ipcMain.handle("toggle_devtools", () => {
    if (!mainWindow) return;
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools();
    }
  });

  ipcMain.handle("reddit_login", async () => {
    return new Promise<boolean>((resolve) => {
      const loginWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: mainWindow ?? undefined,
        modal: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      loginWindow.setMenuBarVisibility(false);

      let resolved = false;
      const done = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        if (!loginWindow.isDestroyed()) loginWindow.close();
        resolve(result);
      };

      // After login, Reddit redirects away from /login/ — use that as the signal.
      const checkLogin = async (_event: any, url: string) => {
        const parsed = new URL(url);
        if (
          parsed.hostname.endsWith("reddit.com") &&
          !parsed.pathname.startsWith("/login") &&
          !parsed.pathname.startsWith("/register") &&
          !parsed.pathname.startsWith("/account/login")
        ) {
          console.error(`[reddit_login] Redirected to ${url}, login successful`);
          done(true);
        }
      };

      loginWindow.webContents.on("did-navigate", checkLogin);
      loginWindow.webContents.on("did-navigate-in-page", checkLogin);

      loginWindow.on("closed", () => done(false));

      loginWindow.loadURL("https://www.reddit.com/login/");
    });
  });

  ipcMain.handle("reddit_logout", async () => {
    const cookies = await session.defaultSession.cookies.get({
      domain: ".reddit.com",
    });
    for (const cookie of cookies) {
      const url = `https://${cookie.domain?.replace(/^\./, "")}${cookie.path}`;
      await session.defaultSession.cookies.remove(url, cookie.name);
    }
    console.error("[reddit_logout] Cleared Reddit cookies");
  });

  ipcMain.handle("reddit_check_login", async () => {
    try {
      const cookies = await session.defaultSession.cookies.get({
        domain: ".reddit.com",
      });
      // reddit_session is only set after actual login (token_v2 exists for anonymous visitors too)
      return cookies.some((c) => c.name === "reddit_session");
    } catch {
      return false;
    }
  });
}

function setupSavedMediaProtocol(): void {
  protocol.handle("saved-media", async (request) => {
    const url = new URL(request.url);
    const decodedPath = decodeURIComponent(url.pathname.slice(1));

    if (!decodedPath) {
      return new Response("Empty path", { status: 400 });
    }

    const filePath = path.join(savePath, decodedPath);
    const resolved = path.resolve(filePath);
    const saveResolved = path.resolve(savePath);

    // Security: prevent path traversal
    if (!resolved.startsWith(saveResolved)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const data = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      // Handle Range requests for video streaming
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
        if (match) {
          const total = data.length;
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : total - 1;
          const clampedEnd = Math.min(end, total - 1);

          if (start < total && start <= clampedEnd) {
            const slice = data.subarray(start, clampedEnd + 1);
            return new Response(slice, {
              status: 206,
              headers: {
                "Content-Type": contentType,
                "Content-Length": String(slice.length),
                "Content-Range": `bytes ${start}-${clampedEnd}/${total}`,
                "Accept-Ranges": "bytes",
              },
            });
          }
        }
      }

      return new Response(data, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(data.length),
          "Accept-Ranges": "bytes",
        },
      });
    } catch {
      return new Response("File not found", { status: 404 });
    }
  });
}

app.whenReady().then(async () => {
  // Initialize paths
  appDataDir = app.getPath("userData");
  favPath = favorites.favoritesPath(appDataDir);
  cfgPath = config.configPath(appDataDir);
  favs = favorites.readFavorites(favPath);
  ignoredPath = ignoredUsersModule.ignoredUsersPath(appDataDir);
  ignoredUsers = ignoredUsersModule.readIgnoredUsers(ignoredPath);
  const cfg = config.readConfig(cfgPath);
  savePath = config.resolveSavePath(cfg, appDataDir);
  savedIds = saved.loadSavedIds(savePath);

  // Start video server
  videoServerPort = await startVideoServer(videoCache);

  // Inject CORS headers so the renderer can fetch from Reddit/RedGifs
  // directly using Chromium's network stack.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["https://www.reddit.com/*", "https://api.redgifs.com/*"] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "access-control-allow-origin": ["*"],
          "access-control-allow-headers": ["*"],
        },
      });
    }
  );

  // Set up protocols and IPC
  setupSavedMediaProtocol();
  setupIPC();

  // Create window
  createWindow();

  // Check for updates (non-blocking, silent on no update)
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
