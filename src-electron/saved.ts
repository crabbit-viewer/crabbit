import * as fs from "fs";
import * as path from "path";
import { net } from "electron";
import type { MediaPost, MediaType } from "./reddit/types";

const USER_AGENT = "desktop:crabbit:v0.1.0";

export interface SavedPostMeta {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  permalink: string;
  media_type: MediaType;
  saved_at: string;
  files: string[];
  audio_file: string | null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
}

function sanitizeTitle(title: string, maxLen: number): string {
  const sanitized = sanitizeFilename(title);
  const truncated = sanitized.slice(0, maxLen);
  return truncated.replace(/[. ]+$/, "");
}

function postBaseName(id: string, title: string): string {
  const safeTitle = sanitizeTitle(title, 80);
  return safeTitle ? `${id}_${safeTitle}` : id;
}

function extensionFromUrl(url: string): string {
  const pathPart = url.split("?")[0];
  const dotPos = pathPart.lastIndexOf(".");
  if (dotPos !== -1) {
    const ext = pathPart.slice(dotPos + 1);
    if (["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm"].includes(ext)) {
      return ext;
    }
  }
  return "jpg";
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  console.error(`[save] Downloading: ${url} -> ${filePath}`);
  const resp = await net.fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);
  fs.writeFileSync(filePath, bytes);
  console.error(`[save] Saved ${bytes.length} bytes to ${filePath}`);
}

export async function savePost(
  savePath: string,
  post: MediaPost
): Promise<SavedPostMeta> {
  const subDir = path.join(savePath, post.subreddit.toLowerCase());
  fs.mkdirSync(subDir, { recursive: true });

  const base = postBaseName(post.id, post.title);
  const files: string[] = [];
  let audioFile: string | null = null;

  if (post.media_type === "gallery") {
    const galleryDir = path.join(subDir, base);
    fs.mkdirSync(galleryDir, { recursive: true });

    const results = await Promise.all(
      post.media.map(async (item, i) => {
        const ext = extensionFromUrl(item.url);
        const filename = `${i}.${ext}`;
        const filePath = path.join(galleryDir, filename);
        await downloadFile(item.url, filePath);
        return `${base}/${filename}`;
      })
    );
    files.push(...results);
  } else if (post.media_type === "embed") {
    throw new Error("Embed posts cannot be saved");
  } else {
    const item = post.media[0];
    if (item) {
      const ext = extensionFromUrl(item.url);
      const filename = `${base}.${ext}`;
      const filePath = path.join(subDir, filename);
      await downloadFile(item.url, filePath);
      files.push(filename);
    }
  }

  // Download audio if present
  if (post.audio_url) {
    const audioName = `${base}_audio.mp4`;
    const audioPath = path.join(subDir, audioName);
    await downloadFile(post.audio_url, audioPath);
    audioFile = audioName;
  }

  const meta: SavedPostMeta = {
    id: post.id,
    title: post.title,
    author: post.author,
    subreddit: post.subreddit,
    score: post.score,
    num_comments: post.num_comments,
    permalink: post.permalink,
    media_type: post.media_type,
    saved_at: new Date().toISOString(),
    files,
    audio_file: audioFile,
  };

  // Write sidecar JSON
  const sidecarPath = path.join(subDir, `${base}.json`);
  fs.writeFileSync(sidecarPath, JSON.stringify(meta, null, 2));

  return meta;
}

export function listSavedPosts(savePath: string): SavedPostMeta[] {
  const posts: SavedPostMeta[] = [];

  if (!fs.existsSync(savePath)) return posts;

  const entries = fs.readdirSync(savePath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const subDir = path.join(savePath, entry.name);
    const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isFile() || !subEntry.name.endsWith(".json")) continue;

      try {
        const content = fs.readFileSync(
          path.join(subDir, subEntry.name),
          "utf-8"
        );
        const meta: SavedPostMeta = JSON.parse(content);
        posts.push(meta);
      } catch {
        // Skip invalid files
      }
    }
  }

  // Sort by saved_at descending (newest first)
  posts.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
  return posts;
}

export function deleteSavedPost(
  savePath: string,
  subreddit: string,
  postId: string
): void {
  const subDir = path.join(savePath, subreddit.toLowerCase());
  if (!fs.existsSync(subDir)) return;

  const entries = fs.readdirSync(subDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(postId)) {
      const fullPath = path.join(subDir, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }
}

export function loadSavedIds(savePath: string): Set<string> {
  const ids = new Set<string>();
  const posts = listSavedPosts(savePath);
  for (const post of posts) {
    ids.add(post.id);
  }
  return ids;
}
