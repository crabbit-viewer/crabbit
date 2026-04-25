import { BrowserWindow, net, session } from "electron";
import { parseListing } from "./parser";
import type { FetchParams, FetchResult, MediaPost, MediaType } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export async function fetchPosts(params: FetchParams, window: BrowserWindow | null): Promise<FetchResult> {
  const sort = params.sort ?? "hot";
  const timeRange = params.time_range ?? "day";
  const limit = Math.min(params.limit ?? 25, 100);
  const t0 = performance.now();

  const isUser = params.subreddit.startsWith("user/");
  console.error(
    `[fetch_posts] ${isUser ? "u/" + params.subreddit.slice(5) : "r/" + params.subreddit} sort=${sort} time=${timeRange} limit=${limit} after=${params.after ?? "null"}`
  );

  const listing = await fetchListing(
    params.subreddit,
    sort,
    timeRange,
    params.after ?? undefined,
    limit
  );
  const tListing = performance.now();
  console.error(`[fetch_posts] Listing fetched in ${(tListing - t0).toFixed(0)}ms`);

  const result = parseListing(listing);

  // Split redgifs into early (first 3) and deferred
  const redgifsIndices: Array<{ index: number; slug: string }> = [];
  for (let i = 0; i < result.posts.length; i++) {
    const embedUrl = result.posts[i].embed_url;
    if (embedUrl?.startsWith("redgifs:")) {
      redgifsIndices.push({ index: i, slug: embedUrl.slice(8) });
    }
  }

  if (redgifsIndices.length > 0) {
    const earlyCount = 3;
    const early = redgifsIndices.slice(0, earlyCount);
    const deferred = redgifsIndices.slice(earlyCount);

    // Resolve first few inline so the first video plays immediately
    let token: string | null = null;
    try {
      token = await redgifsToken();
      const earlyResults = await Promise.allSettled(
        early.map(({ slug }) => redgifsVideoUrl(token!, slug))
      );
      for (let i = 0; i < early.length; i++) {
        const { index, slug } = early[i];
        const r = earlyResults[i];
        if (r.status === "fulfilled") {
          result.posts[index].media_type = "video" as MediaType;
          result.posts[index].media = [{ url: r.value, width: null, height: null, caption: null }];
          result.posts[index].embed_url = null;
        } else {
          result.posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
        }
      }
    } catch {
      for (const { index, slug } of early) {
        result.posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
      }
    }

    // Set remaining redgifs to iframe embeds for now
    for (const { index, slug } of deferred) {
      result.posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
    }

    const tEarly = performance.now();
    console.error(
      `[fetch_posts] Returned ${result.posts.length} posts (${early.length} redgifs resolved, ${deferred.length} deferred) in ${(tEarly - t0).toFixed(0)}ms (listing=${(tListing - t0).toFixed(0)}ms early-redgifs=${(tEarly - tListing).toFixed(0)}ms), after=${result.after ?? "null"}`
    );

    // Resolve remaining redgifs in background
    if (deferred.length > 0 && window && token) {
      resolveRedgifsBackground(result.posts, deferred, token, window);
    }
  } else {
    console.error(
      `[fetch_posts] Returned ${result.posts.length} posts in ${(performance.now() - t0).toFixed(0)}ms, after=${result.after ?? "null"}`
    );
  }

  return result;
}

async function fetchListing(
  subreddit: string,
  sort: string,
  timeRange: string,
  after: string | undefined,
  limit: number
): Promise<any> {
  const base = subreddit.startsWith("user/")
    ? `https://www.reddit.com/user/${subreddit.slice(5)}/submitted/${sort}.json`
    : `https://www.reddit.com/r/${subreddit}/${sort}.json`;
  let url = `${base}?limit=${limit}&raw_json=1`;

  if (after) {
    url += `&after=${after}`;
  }

  if (sort === "top" || sort === "controversial") {
    url += `&t=${timeRange}`;
  }

  // Log cookie count for debugging auth issues
  const cookies = await session.defaultSession.cookies.get({ domain: ".reddit.com" });
  const authCookies = cookies.filter((c) => c.name === "reddit_session" || c.name === "token_v2");
  console.error(`[fetch_listing] ${authCookies.length} auth cookies, ${cookies.length} total reddit cookies`);

  const response = await net.fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Reddit returned status ${response.status}`);
  }

  return response.json();
}

let cachedRedgifsToken: { token: string; expires: number } | null = null;

async function redgifsToken(): Promise<string> {
  if (cachedRedgifsToken && Date.now() < cachedRedgifsToken.expires) {
    return cachedRedgifsToken.token;
  }
  const t0 = performance.now();
  console.error("[redgifs] Requesting auth token...");
  const resp = await net.fetch("https://api.redgifs.com/v2/auth/temporary", {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) throw new Error(`RedGifs auth failed: ${resp.status}`);
  const data: any = await resp.json();
  const token = data?.token;
  if (!token) throw new Error("No token in RedGifs auth response");
  cachedRedgifsToken = { token, expires: Date.now() + 55 * 60 * 1000 };
  console.error(`[redgifs] Auth token obtained in ${(performance.now() - t0).toFixed(0)}ms`);
  return token;
}

async function redgifsVideoUrl(token: string, slug: string): Promise<string> {
  console.error(`[redgifs] Resolving slug '${slug}'`);
  const resp = await net.fetch(`https://api.redgifs.com/v2/gifs/${slug}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!resp.ok) throw new Error(`RedGifs fetch failed: ${resp.status}`);
  const data: any = await resp.json();
  const url = data?.gif?.urls?.hd ?? data?.gif?.urls?.sd;
  if (!url) throw new Error(`No video URL for '${slug}'`);
  return url;
}

function resolveRedgifsBackground(
  posts: MediaPost[],
  redgifsIndices: Array<{ index: number; slug: string }>,
  token: string,
  window: BrowserWindow
): void {
  const t0 = performance.now();
  console.error(`[redgifs] Resolving ${redgifsIndices.length} deferred posts in background`);

  Promise.allSettled(
    redgifsIndices.map(({ slug }) => redgifsVideoUrl(token, slug))
  ).then((results) => {
    const updates: Array<{ id: string; media_type: MediaType; media: MediaPost["media"]; embed_url: string | null }> = [];

    for (let i = 0; i < redgifsIndices.length; i++) {
      const { index } = redgifsIndices[i];
      const result = results[i];
      const post = posts[index];

      if (result.status === "fulfilled") {
        updates.push({
          id: post.id,
          media_type: "video" as MediaType,
          media: [{ url: result.value, width: null, height: null, caption: null }],
          embed_url: null,
        });
      }
    }

    const elapsed = performance.now() - t0;
    console.error(`[redgifs] Background resolved ${updates.length}/${redgifsIndices.length} posts in ${elapsed.toFixed(0)}ms`);

    if (updates.length > 0 && !window.isDestroyed()) {
      window.webContents.send("redgifs-resolved", updates);
    }
  }).catch((err) => {
    console.error(`[redgifs] Background resolution failed: ${err}`);
  });
}
