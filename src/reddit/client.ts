import { parseListing } from "./parser";
import type { FetchParams, FetchResult, MediaPost, MediaType } from "../types";

// Renderer-side Reddit client — uses Chromium's fetch(), so requests
// are indistinguishable from real browser requests (same TLS fingerprint,
// HTTP/2 settings, headers). This avoids Reddit/Cloudflare bot detection.

export async function fetchPosts(params: FetchParams): Promise<FetchResult> {
  const sort = params.sort ?? "hot";
  const timeRange = params.time_range ?? "day";
  const limit = Math.min(params.limit ?? 25, 100);

  let url = `https://www.reddit.com/r/${params.subreddit}/${sort}.json?limit=${limit}&raw_json=1`;
  if (params.after) url += `&after=${params.after}`;
  if (sort === "top" || sort === "controversial") url += `&t=${timeRange}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reddit returned status ${response.status}`);
  }

  const listing = await response.json();
  const result = parseListing(listing);
  await resolveRedgifs(result.posts);
  return result;
}

async function redgifsToken(): Promise<string> {
  const resp = await fetch("https://api.redgifs.com/v2/auth/temporary");
  if (!resp.ok) throw new Error(`RedGifs auth failed: ${resp.status}`);
  const data: any = await resp.json();
  if (!data?.token) throw new Error("No token in RedGifs auth response");
  return data.token;
}

async function redgifsVideoUrl(token: string, slug: string): Promise<string> {
  const resp = await fetch(`https://api.redgifs.com/v2/gifs/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`RedGifs fetch failed: ${resp.status}`);
  const data: any = await resp.json();
  const url = data?.gif?.urls?.hd ?? data?.gif?.urls?.sd;
  if (!url) throw new Error(`No video URL for '${slug}'`);
  return url;
}

async function resolveRedgifs(posts: MediaPost[]): Promise<void> {
  const indices: Array<{ index: number; slug: string }> = [];
  for (let i = 0; i < posts.length; i++) {
    const embedUrl = posts[i].embed_url;
    if (embedUrl?.startsWith("redgifs:")) {
      indices.push({ index: i, slug: embedUrl.slice(8) });
    }
  }
  if (indices.length === 0) return;

  let token: string;
  try {
    token = await redgifsToken();
  } catch {
    for (const { index, slug } of indices) {
      posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
    }
    return;
  }

  const results = await Promise.allSettled(
    indices.map(({ slug }) => redgifsVideoUrl(token, slug))
  );

  for (let i = 0; i < indices.length; i++) {
    const { index, slug } = indices[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      posts[index].media_type = "video" as MediaType;
      posts[index].media = [{ url: result.value, width: null, height: null, caption: null }];
      posts[index].embed_url = null;
    } else {
      posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
    }
  }
}
