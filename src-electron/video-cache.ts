import * as http from "http";
import * as crypto from "crypto";
import { net } from "electron";

const USER_AGENT = "desktop:crabbit:v0.1.0";
const MAX_ENTRIES = 50;
const EVICT_COUNT = 10;

interface CachedVideo {
  bytes: Buffer;
  contentType: string;
  lastAccess: number;
}

export class VideoCache {
  private entries = new Map<string, CachedVideo>();
  private counter = 0;
  private inflight = new Set<string>();
  private inflightWaiters = new Map<string, Array<{ resolve: (key: string) => void; reject: (err: Error) => void }>>();

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): CachedVideo | undefined {
    return this.entries.get(key);
  }

  touch(key: string): void {
    this.counter++;
    const entry = this.entries.get(key);
    if (entry) entry.lastAccess = this.counter;
  }

  insert(key: string, bytes: Buffer, contentType: string): void {
    this.ensureCapacity();
    this.counter++;
    this.entries.set(key, { bytes, contentType, lastAccess: this.counter });
  }

  private ensureCapacity(): void {
    if (this.entries.size >= MAX_ENTRIES) {
      const sorted = [...this.entries.entries()].sort(
        (a, b) => a[1].lastAccess - b[1].lastAccess
      );
      for (let i = 0; i < EVICT_COUNT && i < sorted.length; i++) {
        this.entries.delete(sorted[i][0]);
      }
      console.error(
        `[cache] LRU evicted ${EVICT_COUNT} entries, ${this.entries.size} remaining`
      );
    }
  }

  isInflight(key: string): boolean {
    return this.inflight.has(key);
  }

  markInflight(key: string): boolean {
    if (this.inflight.has(key)) return false;
    this.inflight.add(key);
    return true;
  }

  clearInflight(key: string): void {
    this.inflight.delete(key);
    // Resolve any waiters
    const waiters = this.inflightWaiters.get(key);
    if (waiters) {
      this.inflightWaiters.delete(key);
      if (this.entries.has(key)) {
        for (const w of waiters) w.resolve(key);
      } else {
        for (const w of waiters) w.reject(new Error("Download failed"));
      }
    }
  }

  waitForInflight(key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for in-flight download"));
      }, 30000);

      const waiters = this.inflightWaiters.get(key) ?? [];
      waiters.push({
        resolve: (k: string) => { clearTimeout(timeout); resolve(k); },
        reject: (e: Error) => { clearTimeout(timeout); reject(e); },
      });
      this.inflightWaiters.set(key, waiters);
    });
  }
}

export function urlToCacheKey(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

export async function preloadVideo(
  cache: VideoCache,
  url: string
): Promise<string> {
  const key = urlToCacheKey(url);

  if (cache.has(key)) {
    cache.touch(key);
    return key;
  }

  if (cache.isInflight(key)) {
    console.error(`[preload] Already downloading: ${url}`);
    return cache.waitForInflight(key);
  }

  cache.markInflight(key);
  console.error(`[preload] Downloading: ${url}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const resp = await net.fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.status === 429 || resp.status === 403) {
      throw new Error(`Rate limited (${resp.status}): ${url}`);
    }

    const contentType =
      resp.headers.get("content-type") ?? "video/mp4";
    const arrayBuf = await resp.arrayBuffer();
    const bytes = Buffer.from(arrayBuf);

    console.error(
      `[preload] Cached ${bytes.length} bytes (status=${resp.status} type=${contentType}) for: ${url}`
    );

    cache.insert(key, bytes, contentType);
    return key;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error(`[preload] TIMEOUT after 30s: ${url}`);
      throw new Error(`Download timed out: ${url}`);
    }
    throw err;
  } finally {
    cache.clearInflight(key);
  }
}

function parseRange(
  rangeStr: string,
  total: number
): { start: number; end: number } | null {
  const match = rangeStr.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : total - 1;

  if (start >= total || start > end) return null;
  return { start, end: Math.min(end, total - 1) };
}

export function startVideoServer(cache: VideoCache): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const key = (req.url ?? "").slice(1); // Remove leading /
      if (!key) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      cache.touch(key);
      const cached = cache.get(key);
      if (!cached) {
        console.error(`[videoserver] 404 key=${key}`);
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const total = cached.bytes.length;
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const range = parseRange(rangeHeader, total);
        if (range) {
          const { start, end } = range;
          const slice = cached.bytes.subarray(start, end + 1);
          console.error(
            `[videoserver] 206 bytes ${start}-${end}/${total} (${slice.length} bytes) key=${key}`
          );
          res.writeHead(206, {
            "Content-Type": cached.contentType,
            "Content-Length": slice.length,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(slice);
          return;
        }
      }

      console.error(
        `[videoserver] 200 full ${total} bytes key=${key}`
      );
      res.writeHead(200, {
        "Content-Type": cached.contentType,
        "Content-Length": total,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(cached.bytes);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      console.error(`[videoserver] Listening on 127.0.0.1:${port}`);
      resolve(port);
    });
  });
}
