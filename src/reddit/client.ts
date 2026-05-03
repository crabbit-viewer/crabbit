import { parseListing } from "./parser";
import type { FetchParams, FetchResult, MediaPost, MediaType } from "../types";

// Renderer-side Reddit client — uses Chromium's fetch(), so requests
// are indistinguishable from real browser requests (same TLS fingerprint,
// HTTP/2 settings, headers). This avoids Reddit/Cloudflare bot detection.

export interface FetchPostsResult {
  result: FetchResult;
  deferredUpdates: Promise<Array<{ id: string; media_type: MediaType; media: MediaPost["media"]; embed_url: string | null; thumbnail_url?: string | null }>> | null;
}

export async function fetchPosts(params: FetchParams): Promise<FetchPostsResult> {
  const sort = params.sort ?? "hot";
  const timeRange = params.time_range ?? "day";
  const limit = Math.min(params.limit ?? 25, 100);
  const t0 = performance.now();

  const isUser = params.subreddit.startsWith("user/");
  const base = isUser
    ? `https://www.reddit.com/user/${params.subreddit.slice(5)}/submitted.json`
    : `https://www.reddit.com/r/${params.subreddit}/${sort}.json`;
  let url = `${base}?limit=${limit}&raw_json=1`;
  if (isUser) url += `&sort=${sort}`;
  if (params.after) url += `&after=${params.after}`;
  if (sort === "top" || sort === "controversial") url += `&t=${timeRange}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reddit returned status ${response.status}`);
  }

  const listing = await response.json();
  const result = parseListing(listing);

  // Split redgifs into early (first 3) and deferred
  const redgifsIndices: Array<{ index: number; slug: string }> = [];
  for (let i = 0; i < result.posts.length; i++) {
    const embedUrl = result.posts[i].embed_url;
    if (embedUrl?.startsWith("redgifs:")) {
      redgifsIndices.push({ index: i, slug: embedUrl.slice(8) });
    }
  }

  let deferredUpdates: FetchPostsResult["deferredUpdates"] = null;

  if (redgifsIndices.length > 0) {
    const earlyCount = 3;
    const early = redgifsIndices.slice(0, earlyCount);
    const deferred = redgifsIndices.slice(earlyCount);

    let token: string | null = null;
    try {
      token = await redgifsToken();
      const earlyResults = await Promise.allSettled(
        early.map(({ slug }) => redgifsResolve(token!, slug))
      );
      for (let i = 0; i < early.length; i++) {
        const { index, slug } = early[i];
        const r = earlyResults[i];
        if (r.status === "fulfilled") {
          result.posts[index].media_type = "video" as MediaType;
          result.posts[index].media = [{ url: r.value.videoUrl, width: null, height: null, caption: null }];
          result.posts[index].embed_url = null;
          if (r.value.thumbnailUrl) {
            result.posts[index].thumbnail_url = r.value.thumbnailUrl;
          }
        } else {
          result.posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
        }
      }
    } catch {
      for (const { index, slug } of early) {
        result.posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
      }
    }

    // Set remaining to iframe embeds
    for (const { index, slug } of deferred) {
      result.posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
    }

    console.log(`[fetch_posts:renderer] ${result.posts.length} posts (${early.length} redgifs resolved, ${deferred.length} deferred) in ${(performance.now() - t0).toFixed(0)}ms`);

    // Return deferred promise for remaining redgifs
    if (deferred.length > 0 && token) {
      const capturedToken = token;
      deferredUpdates = Promise.allSettled(
        deferred.map(({ slug }) => redgifsResolve(capturedToken, slug))
      ).then((results) => {
        const updates: Array<{ id: string; media_type: MediaType; media: MediaPost["media"]; embed_url: string | null; thumbnail_url?: string | null }> = [];
        for (let i = 0; i < deferred.length; i++) {
          const { index } = deferred[i];
          const r = results[i];
          if (r.status === "fulfilled") {
            updates.push({
              id: result.posts[index].id,
              media_type: "video" as MediaType,
              media: [{ url: r.value.videoUrl, width: null, height: null, caption: null }],
              embed_url: null,
              thumbnail_url: r.value.thumbnailUrl,
            });
          }
        }
        console.log(`[fetch_posts:renderer] Background resolved ${updates.length}/${deferred.length} deferred redgifs`);
        return updates;
      });
    }
  }

  return { result, deferredUpdates };
}

let cachedToken: { token: string; expires: number } | null = null;

async function redgifsToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }
  const resp = await fetch("https://api.redgifs.com/v2/auth/temporary");
  if (!resp.ok) throw new Error(`RedGifs auth failed: ${resp.status}`);
  const data: any = await resp.json();
  if (!data?.token) throw new Error("No token in RedGifs auth response");
  cachedToken = { token: data.token, expires: Date.now() + 55 * 60 * 1000 };
  return data.token;
}

interface RedgifsResult {
  videoUrl: string;
  thumbnailUrl: string | null;
}

async function redgifsResolve(token: string, slug: string): Promise<RedgifsResult> {
  const resp = await fetch(`https://api.redgifs.com/v2/gifs/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`RedGifs fetch failed: ${resp.status}`);
  const data: any = await resp.json();
  const videoUrl = data?.gif?.urls?.hd ?? data?.gif?.urls?.sd;
  if (!videoUrl) throw new Error(`No video URL for '${slug}'`);
  const thumbnailUrl: string | null = data?.gif?.urls?.thumbnail ?? data?.gif?.urls?.poster ?? null;
  return { videoUrl, thumbnailUrl };
}
