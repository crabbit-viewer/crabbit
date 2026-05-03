// Re-export frontend types for use in the backend.
// These match the frontend types in src/types.ts exactly.

export type MediaType = "image" | "video" | "animated_gif" | "gallery" | "embed";

export interface MediaItem {
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
}

export interface MediaPost {
  id: string;
  title: string;
  author: string;
  score: number;
  num_comments: number;
  permalink: string;
  subreddit: string;
  over_18: boolean;
  media_type: MediaType;
  media: MediaItem[];
  audio_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
}

export interface FetchResult {
  posts: MediaPost[];
  after: string | null;
}

export interface FetchParams {
  subreddit: string;
  sort?: string;
  time_range?: string;
  after?: string | null;
  limit?: number;
}
