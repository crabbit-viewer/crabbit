import { net } from "electron";
import { parseListing } from "./parser";
import type { FetchParams, FetchResult, MediaPost, MediaType } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export async function fetchPosts(params: FetchParams): Promise<FetchResult> {
  const sort = params.sort ?? "hot";
  const timeRange = params.time_range ?? "day";
  const limit = Math.min(params.limit ?? 25, 100);

  console.error(
    `[fetch_posts] r/${params.subreddit} sort=${sort} time=${timeRange} limit=${limit} after=${params.after ?? "null"}`
  );

  const listing = await fetchListing(
    params.subreddit,
    sort,
    timeRange,
    params.after ?? undefined,
    limit
  );

  const result = parseListing(listing);
  await resolveRedgifs(result.posts);

  console.error(
    `[fetch_posts] Returned ${result.posts.length} posts, after=${result.after ?? "null"}`
  );

  return result;
}

async function fetchListing(
  subreddit: string,
  sort: string,
  timeRange: string,
  after: string | undefined,
  limit: number
): Promise<any> {
  let url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;

  if (after) {
    url += `&after=${after}`;
  }

  if (sort === "top" || sort === "controversial") {
    url += `&t=${timeRange}`;
  }

  const response = await net.fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Reddit returned status ${response.status}`);
  }

  return response.json();
}

async function redgifsToken(): Promise<string> {
  console.error("[redgifs] Requesting auth token...");
  const resp = await net.fetch("https://api.redgifs.com/v2/auth/temporary", {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) throw new Error(`RedGifs auth failed: ${resp.status}`);
  const data: any = await resp.json();
  const token = data?.token;
  if (!token) throw new Error("No token in RedGifs auth response");
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

async function resolveRedgifs(posts: MediaPost[]): Promise<void> {
  const redgifsIndices: Array<{ index: number; slug: string }> = [];

  for (let i = 0; i < posts.length; i++) {
    const embedUrl = posts[i].embed_url;
    if (embedUrl?.startsWith("redgifs:")) {
      redgifsIndices.push({ index: i, slug: embedUrl.slice(8) });
    }
  }

  if (redgifsIndices.length === 0) return;
  console.error(`[redgifs] Found ${redgifsIndices.length} posts to resolve`);

  let token: string;
  try {
    token = await redgifsToken();
  } catch {
    // Fallback to iframe embeds
    for (const { index, slug } of redgifsIndices) {
      posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
    }
    return;
  }

  const results = await Promise.allSettled(
    redgifsIndices.map(({ slug }) => redgifsVideoUrl(token, slug))
  );

  for (let i = 0; i < redgifsIndices.length; i++) {
    const { index, slug } = redgifsIndices[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      const videoUrl = result.value;
      posts[index].media_type = "video" as MediaType;
      posts[index].media = [
        { url: videoUrl, width: null, height: null, caption: null },
      ];
      posts[index].embed_url = null;
    } else {
      posts[index].embed_url = `https://www.redgifs.com/ifr/${slug}`;
    }
  }
}
