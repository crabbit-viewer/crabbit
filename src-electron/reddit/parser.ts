import type { FetchResult, MediaItem, MediaPost, MediaType } from "./types";

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

  // Extract thumbnail from Reddit preview data (useful for video posts in grid views)
  const thumbnailUrl: string | null = post.preview?.images?.[0]?.source?.url ?? null;

  const base: MediaPost = {
    id,
    title,
    author,
    score,
    num_comments,
    permalink,
    subreddit,
    over_18,
    media_type: "image",
    media: [],
    audio_url: null,
    embed_url: null,
    thumbnail_url: thumbnailUrl,
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
  if (
    urlLower.endsWith(".jpg") ||
    urlLower.endsWith(".jpeg") ||
    urlLower.endsWith(".png") ||
    urlLower.endsWith(".webp")
  ) {
    return {
      ...base,
      media_type: "image",
      media: [{ url, width: null, height: null, caption: null }],
    };
  }

  // 4. Direct gif URL
  if (urlLower.endsWith(".gif")) {
    return {
      ...base,
      media_type: "image",
      media: [{ url, width: null, height: null, caption: null }],
    };
  }

  // 5. i.redd.it or i.imgur.com domain
  if (domain === "i.redd.it" || domain === "i.imgur.com") {
    return {
      ...base,
      media_type: "image",
      media: [{ url, width: null, height: null, caption: null }],
    };
  }

  // 6. imgur.com (no extension, not album) -> transform to direct image
  if (domain === "imgur.com" && !url.includes("/a/") && !url.includes("/gallery/")) {
    const imgurId = url.split("/").pop() ?? "";
    if (imgurId) {
      return {
        ...base,
        media_type: "image",
        media: [{ url: `https://i.imgur.com/${imgurId}.jpg`, width: null, height: null, caption: null }],
      };
    }
  }

  // 7. .gifv -> .mp4
  if (urlLower.endsWith(".gifv")) {
    return {
      ...base,
      media_type: "animated_gif",
      media: [{ url: url.slice(0, -5) + ".mp4", width: null, height: null, caption: null }],
    };
  }

  // 8. Direct .mp4
  if (urlLower.endsWith(".mp4")) {
    return {
      ...base,
      media_type: "video",
      media: [{ url, width: null, height: null, caption: null }],
    };
  }

  // 9. post_hint == "image" with preview
  if (postHint === "image") {
    const previewUrl: string | undefined = post.preview?.images?.[0]?.source?.url;
    if (previewUrl) {
      return {
        ...base,
        media_type: "image",
        media: [{
          url: previewUrl,
          width: post.preview?.images?.[0]?.source?.width ?? null,
          height: post.preview?.images?.[0]?.source?.height ?? null,
          caption: null,
        }],
      };
    }
  }

  // 10. YouTube
  if (domain.includes("youtube.com") || domain.includes("youtu.be")) {
    const embed = youtubeEmbedUrl(url);
    if (embed) {
      return { ...base, media_type: "embed", embed_url: embed };
    }
  }

  // 11. Redgifs — store slug for async resolution
  if (domain.includes("redgifs.com")) {
    const slug = redgifsSlug(url);
    if (slug) {
      return { ...base, media_type: "embed", embed_url: `redgifs:${slug}` };
    }
  }

  // 12. rich:video with secure_media_embed
  if (postHint === "rich:video") {
    const content: string | undefined = post.secure_media_embed?.content;
    if (content) {
      const src = extractIframeSrc(content);
      if (src) {
        // Check if it's a redgifs embed — resolve as direct video instead of iframe
        if (src.includes("redgifs.com")) {
          const slug = redgifsSlugFromUrl(src);
          if (slug) {
            return { ...base, media_type: "embed", embed_url: `redgifs:${slug}` };
          }
        }
        return { ...base, media_type: "embed", embed_url: src };
      }
    }
  }

  // 13. Skip everything else
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

    media.push({
      url,
      width: source?.x ?? null,
      height: source?.y ?? null,
      caption: item.caption ?? null,
    });
  }

  if (media.length === 0) return null;

  return { ...base, media_type: "gallery", media };
}

function tryRedditVideo(post: any, base: MediaPost): MediaPost | null {
  const redditVideo = post.media?.reddit_video;
  if (!redditVideo) return null;

  const fallbackUrl: string | undefined = redditVideo.fallback_url;
  if (!fallbackUrl) return null;

  const width: number | null = redditVideo.width ?? null;
  const height: number | null = redditVideo.height ?? null;
  const isGif: boolean = redditVideo.is_gif ?? false;

  let audioUrl: string | null = null;
  if (!isGif) {
    const dashPos = fallbackUrl.lastIndexOf("DASH_");
    if (dashPos !== -1) {
      audioUrl = fallbackUrl.slice(0, dashPos) + "DASH_AUDIO_128.mp4";
    }
  }

  const mediaType: MediaType = isGif ? "animated_gif" : "video";

  return {
    ...base,
    media_type: mediaType,
    media: [{ url: fallbackUrl, width, height, caption: null }],
    audio_url: audioUrl,
  };
}

function youtubeEmbedUrl(url: string): string | null {
  // youtube.com/watch?v=ID
  const vPos = url.indexOf("v=");
  if (vPos !== -1) {
    let id = url.slice(vPos + 2);
    id = id.split("&")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  // youtu.be/ID
  if (url.includes("youtu.be/")) {
    let id = url.split("youtu.be/").pop() ?? "";
    id = id.split("?")[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  return null;
}

function redgifsSlug(url: string): string | null {
  const parts = url.split("/watch/");
  if (parts.length < 2) return null;
  let slug = parts[parts.length - 1];
  slug = slug.split("?")[0];
  if (slug) return slug.toLowerCase();
  return null;
}

function redgifsSlugFromUrl(url: string): string | null {
  // Handles /watch/, /ifr/, and other redgifs URL patterns
  const match = url.match(/redgifs\.com\/(?:watch|ifr)\/([a-zA-Z0-9]+)/);
  if (match) return match[1].toLowerCase();
  return null;
}

function extractIframeSrc(html: string): string | null {
  const srcPos = html.indexOf('src="');
  const srcPosSingle = html.indexOf("src='");
  const pos = srcPos !== -1 ? srcPos : srcPosSingle;
  if (pos === -1) return null;

  const quoteChar = html[pos + 4];
  const start = pos + 5;
  const rest = html.slice(start);
  const end = rest.indexOf(quoteChar);
  if (end === -1) return null;

  return rest.slice(0, end);
}
