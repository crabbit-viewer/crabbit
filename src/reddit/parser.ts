import type { FetchResult, MediaItem, MediaPost } from "../types";

export function parseListing(listing: any): FetchResult {
  const after: string | null = listing?.data?.after ?? null;

  const children: any[] = listing?.data?.children ?? [];
  const posts: MediaPost[] = children
    .map((child: any) => parsePost(child?.data))
    .filter((p: MediaPost | null): p is MediaPost => p !== null);

  return { posts, after };
}

function parsePost(post: any): MediaPost | null {
  if (!post) return null;
  if (post.is_self) return null;

  const id: string | undefined = post.id;
  if (!id) return null;

  const title: string = post.title ?? "";
  const author: string = post.author ?? "[deleted]";
  const score: number = post.score ?? 0;
  const num_comments: number = post.num_comments ?? 0;
  const permalink: string = post.permalink ?? "";
  const subreddit: string = post.subreddit ?? "";
  const over_18: boolean = post.over_18 ?? false;
  const url: string = post.url ?? "";
  const domain: string = post.domain ?? "";
  const postHint: string = post.post_hint ?? "";

  const base: MediaPost = {
    id, title, author, score, num_comments, permalink, subreddit, over_18,
    media_type: "image", media: [], audio_url: null, embed_url: null,
  };

  // 1. Gallery
  if (post.is_gallery) {
    const result = tryGallery(post, base);
    if (result) return result;
  }

  // 2. Reddit video (v.redd.it)
  if (post.is_video) {
    const result = tryRedditVideo(post, base);
    if (result) return result;
  }

  // 3. Direct image URL
  const urlLower = url.toLowerCase();
  if (urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg") ||
      urlLower.endsWith(".png") || urlLower.endsWith(".webp")) {
    return { ...base, media: [{ url, width: null, height: null, caption: null }] };
  }

  // 4. Direct gif URL
  if (urlLower.endsWith(".gif")) {
    return { ...base, media: [{ url, width: null, height: null, caption: null }] };
  }

  // 5. i.redd.it or i.imgur.com domain
  if (domain === "i.redd.it" || domain === "i.imgur.com") {
    return { ...base, media: [{ url, width: null, height: null, caption: null }] };
  }

  // 6. imgur.com (no extension, not album)
  if (domain === "imgur.com" && !url.includes("/a/") && !url.includes("/gallery/")) {
    const imgurId = url.split("/").pop() ?? "";
    if (imgurId) {
      return { ...base, media: [{ url: `https://i.imgur.com/${imgurId}.jpg`, width: null, height: null, caption: null }] };
    }
  }

  // 7. .gifv -> .mp4
  if (urlLower.endsWith(".gifv")) {
    return { ...base, media_type: "animated_gif", media: [{ url: url.slice(0, -5) + ".mp4", width: null, height: null, caption: null }] };
  }

  // 8. Direct .mp4
  if (urlLower.endsWith(".mp4")) {
    return { ...base, media_type: "video", media: [{ url, width: null, height: null, caption: null }] };
  }

  // 9. post_hint == "image" with preview
  if (postHint === "image") {
    const previewUrl: string | undefined = post.preview?.images?.[0]?.source?.url;
    if (previewUrl) {
      return { ...base, media: [{
        url: previewUrl,
        width: post.preview?.images?.[0]?.source?.width ?? null,
        height: post.preview?.images?.[0]?.source?.height ?? null,
        caption: null,
      }] };
    }
  }

  // 10. YouTube
  if (domain.includes("youtube.com") || domain.includes("youtu.be")) {
    const embed = youtubeEmbedUrl(url);
    if (embed) return { ...base, media_type: "embed", embed_url: embed };
  }

  // 11. Redgifs — store slug for async resolution
  if (domain.includes("redgifs.com")) {
    const slug = redgifsSlug(url);
    if (slug) return { ...base, media_type: "embed", embed_url: `redgifs:${slug}` };
  }

  // 12. rich:video with secure_media_embed
  if (postHint === "rich:video") {
    const content: string | undefined = post.secure_media_embed?.content;
    if (content) {
      const src = extractIframeSrc(content);
      if (src) return { ...base, media_type: "embed", embed_url: src };
    }
  }

  return null;
}

function tryGallery(post: any, base: MediaPost): MediaPost | null {
  const metadata = post.media_metadata;
  const galleryItems: any[] | undefined = post.gallery_data?.items;
  if (!metadata || !galleryItems) return null;

  const media: MediaItem[] = [];
  for (const item of galleryItems) {
    const mediaId: string | undefined = item.media_id;
    if (!mediaId) return null;
    const entry = metadata[mediaId];
    if (!entry) return null;
    if (entry.status !== "valid") continue;
    const source = entry.s;
    const url: string | undefined = source?.u ?? source?.gif ?? source?.mp4;
    if (!url) return null;
    media.push({ url, width: source?.x ?? null, height: source?.y ?? null, caption: item.caption ?? null });
  }
  if (media.length === 0) return null;
  return { ...base, media_type: "gallery", media };
}

function tryRedditVideo(post: any, base: MediaPost): MediaPost | null {
  const redditVideo = post.media?.reddit_video;
  if (!redditVideo) return null;
  const fallbackUrl: string | undefined = redditVideo.fallback_url;
  if (!fallbackUrl) return null;
  const isGif: boolean = redditVideo.is_gif ?? false;
  let audioUrl: string | null = null;
  if (!isGif) {
    const dashPos = fallbackUrl.lastIndexOf("DASH_");
    if (dashPos !== -1) audioUrl = fallbackUrl.slice(0, dashPos) + "DASH_AUDIO_128.mp4";
  }
  return {
    ...base,
    media_type: isGif ? "animated_gif" : "video",
    media: [{ url: fallbackUrl, width: redditVideo.width ?? null, height: redditVideo.height ?? null, caption: null }],
    audio_url: audioUrl,
  };
}

function youtubeEmbedUrl(url: string): string | null {
  const vPos = url.indexOf("v=");
  if (vPos !== -1) return `https://www.youtube.com/embed/${url.slice(vPos + 2).split("&")[0]}`;
  if (url.includes("youtu.be/")) {
    const id = (url.split("youtu.be/").pop() ?? "").split("?")[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  return null;
}

function redgifsSlug(url: string): string | null {
  const parts = url.split("/watch/");
  if (parts.length < 2) return null;
  const slug = parts[parts.length - 1].split("?")[0];
  return slug ? slug.toLowerCase() : null;
}

function extractIframeSrc(html: string): string | null {
  const pos = html.indexOf('src="') !== -1 ? html.indexOf('src="') : html.indexOf("src='");
  if (pos === -1) return null;
  const quoteChar = html[pos + 4];
  const rest = html.slice(pos + 5);
  const end = rest.indexOf(quoteChar);
  return end === -1 ? null : rest.slice(0, end);
}
