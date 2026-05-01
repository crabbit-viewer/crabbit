import { MediaFilter, MediaPost, MediaType, SortOption, TimeRange } from "../types";

function matchesFilter(mediaType: MediaType, filter: MediaFilter): boolean {
  if (filter === "all") return true;
  if (filter === "photos") return mediaType === "image" || mediaType === "gallery";
  return mediaType === "video" || mediaType === "animated_gif" || mediaType === "embed";
}

export interface Notification {
  message: string;
  type: "success" | "error";
}

export interface PreviousView {
  posts: MediaPost[];
  currentIndex: number;
  after: string | null;
  subreddit: string;
}

export interface AppState {
  posts: MediaPost[];
  currentIndex: number;
  after: string | null;
  isLoading: boolean;
  error: string | null;
  isPlaying: boolean;
  timerSpeed: number;
  showOverlay: boolean;
  subreddit: string;
  sort: SortOption;
  timeRange: TimeRange;
  galleryIndex: number;
  isMuted: boolean;
  volume: number;
  mediaFilter: MediaFilter;
  viewMode: "slideshow" | "saved";
  savedDisplayMode: "grid" | "slideshow";
  previousView: PreviousView | null;
  notification: Notification | null;
  currentPostSaved: boolean;
  isLoggedIn: boolean;
  sidebarOpen: boolean;
  autoplayMode: boolean;
}

const defaultState: AppState = {
  posts: [],
  currentIndex: 0,
  after: null,
  isLoading: false,
  error: null,
  isPlaying: false,
  timerSpeed: 5000,
  showOverlay: true,
  subreddit: "",
  sort: "hot",
  timeRange: "day",
  galleryIndex: 0,
  isMuted: false,
  volume: 100,
  mediaFilter: "all",
  viewMode: "slideshow",
  savedDisplayMode: "grid",
  previousView: null,
  notification: null,
  currentPostSaved: false,
  isLoggedIn: false,
  sidebarOpen: false,
  autoplayMode: false,
};

export const initialState: AppState = defaultState;

export type AppAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_POSTS"; payload: { posts: MediaPost[]; after: string | null } }
  | { type: "APPEND_POSTS"; payload: { posts: MediaPost[]; after: string | null } }
  | { type: "NEXT_SLIDE" }
  | { type: "PREV_SLIDE" }
  | { type: "SET_INDEX"; payload: number }
  | { type: "TOGGLE_PLAY" }
  | { type: "SET_PLAYING"; payload: boolean }
  | { type: "SET_SPEED"; payload: number }
  | { type: "TOGGLE_OVERLAY" }
  | { type: "SET_SUBREDDIT"; payload: string }
  | { type: "SET_SORT"; payload: SortOption }
  | { type: "SET_TIME_RANGE"; payload: TimeRange }
  | { type: "SET_GALLERY_INDEX"; payload: number }
  | { type: "NEXT_GALLERY" }
  | { type: "PREV_GALLERY" }
  | { type: "TOGGLE_MUTE" }
  | { type: "SET_VOLUME"; payload: number }
  | { type: "SET_VIEW_MODE"; payload: "slideshow" | "saved" }
  | { type: "SET_SAVED_DISPLAY_MODE"; payload: "grid" | "slideshow" }
  | { type: "SET_NOTIFICATION"; payload: Notification | null }
  | { type: "SET_CURRENT_POST_SAVED"; payload: boolean }
  | { type: "ENTER_SAVED_VIEW"; payload: { posts: MediaPost[] } }
  | { type: "EXIT_SAVED_VIEW" }
  | { type: "REMOVE_POSTS_BY_AUTHOR"; payload: string }
  | { type: "SET_LOGGED_IN"; payload: boolean }
  | { type: "SET_MEDIA_FILTER"; payload: MediaFilter }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR"; payload: boolean }
  | { type: "UPDATE_POSTS"; payload: Array<{ id: string; media_type: MediaType; media: MediaPost["media"]; embed_url: string | null }> }
  | { type: "TOGGLE_AUTOPLAY" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_POSTS":
      return {
        ...state,
        posts: action.payload.posts,
        after: action.payload.after,
        currentIndex: 0,
        galleryIndex: 0,
        error: null,
      };
    case "APPEND_POSTS":
      return {
        ...state,
        posts: [...state.posts, ...action.payload.posts],
        after: action.payload.after,
      };
    case "NEXT_SLIDE": {
      for (let i = state.currentIndex + 1; i < state.posts.length; i++) {
        if (matchesFilter(state.posts[i].media_type, state.mediaFilter)) {
          return { ...state, currentIndex: i, galleryIndex: 0 };
        }
      }
      return state;
    }
    case "PREV_SLIDE": {
      for (let i = state.currentIndex - 1; i >= 0; i--) {
        if (matchesFilter(state.posts[i].media_type, state.mediaFilter)) {
          return { ...state, currentIndex: i, galleryIndex: 0 };
        }
      }
      return state;
    }
    case "SET_INDEX":
      return { ...state, currentIndex: action.payload, galleryIndex: 0 };
    case "TOGGLE_PLAY":
      return { ...state, isPlaying: !state.isPlaying };
    case "SET_PLAYING":
      return { ...state, isPlaying: action.payload };
    case "SET_SPEED":
      return { ...state, timerSpeed: action.payload };
    case "TOGGLE_OVERLAY":
      return { ...state, showOverlay: !state.showOverlay };
    case "SET_SUBREDDIT":
      return { ...state, subreddit: action.payload };
    case "SET_SORT":
      return { ...state, sort: action.payload };
    case "SET_TIME_RANGE":
      return { ...state, timeRange: action.payload };
    case "SET_GALLERY_INDEX":
      return { ...state, galleryIndex: action.payload };
    case "NEXT_GALLERY": {
      const post = state.posts[state.currentIndex];
      if (!post || post.media_type !== "gallery") return state;
      if (state.galleryIndex >= post.media.length - 1) return state;
      return { ...state, galleryIndex: state.galleryIndex + 1 };
    }
    case "PREV_GALLERY": {
      if (state.galleryIndex <= 0) return state;
      return { ...state, galleryIndex: state.galleryIndex - 1 };
    }
    case "TOGGLE_MUTE":
      return { ...state, isMuted: !state.isMuted };
    case "SET_VOLUME":
      return { ...state, volume: Math.max(0, Math.min(100, action.payload)) };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };
    case "SET_SAVED_DISPLAY_MODE":
      return { ...state, savedDisplayMode: action.payload };
    case "SET_NOTIFICATION":
      return { ...state, notification: action.payload };
    case "SET_CURRENT_POST_SAVED":
      return { ...state, currentPostSaved: action.payload };
    case "ENTER_SAVED_VIEW":
      return {
        ...state,
        previousView: {
          posts: state.posts,
          currentIndex: state.currentIndex,
          after: state.after,
          subreddit: state.subreddit,
        },
        posts: action.payload.posts,
        currentIndex: 0,
        galleryIndex: 0,
        after: null,
        viewMode: "saved",
        savedDisplayMode: "grid",
        isPlaying: false,
      };
    case "EXIT_SAVED_VIEW": {
      if (!state.previousView) {
        return { ...state, viewMode: "slideshow" };
      }
      return {
        ...state,
        posts: state.previousView.posts,
        currentIndex: state.previousView.currentIndex,
        after: state.previousView.after,
        subreddit: state.previousView.subreddit,
        previousView: null,
        viewMode: "slideshow",
        savedDisplayMode: "grid",
        galleryIndex: 0,
      };
    }
    case "REMOVE_POSTS_BY_AUTHOR": {
      const authorLower = action.payload.toLowerCase();
      const filtered = state.posts.filter(
        (p) => p.author.toLowerCase() !== authorLower
      );
      const newIndex = Math.min(state.currentIndex, Math.max(0, filtered.length - 1));
      return { ...state, posts: filtered, currentIndex: newIndex, galleryIndex: 0 };
    }
    case "SET_LOGGED_IN":
      return { ...state, isLoggedIn: action.payload };
    case "SET_MEDIA_FILTER": {
      const filter = action.payload;
      if (filter === "all") {
        return { ...state, mediaFilter: filter };
      }
      // Find the first matching post at or after current index
      for (let i = state.currentIndex; i < state.posts.length; i++) {
        if (matchesFilter(state.posts[i].media_type, filter)) {
          return { ...state, mediaFilter: filter, currentIndex: i, galleryIndex: 0 };
        }
      }
      // Try from the beginning
      for (let i = 0; i < state.currentIndex; i++) {
        if (matchesFilter(state.posts[i].media_type, filter)) {
          return { ...state, mediaFilter: filter, currentIndex: i, galleryIndex: 0 };
        }
      }
      // No matching posts, just set the filter
      return { ...state, mediaFilter: filter };
    }
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "SET_SIDEBAR":
      return { ...state, sidebarOpen: action.payload };
    case "UPDATE_POSTS": {
      const updateMap = new Map(action.payload.map((u) => [u.id, u]));
      const updatedPosts = state.posts.map((post) => {
        const update = updateMap.get(post.id);
        if (update) {
          return { ...post, media_type: update.media_type, media: update.media, embed_url: update.embed_url };
        }
        return post;
      });
      return { ...state, posts: updatedPosts };
    }
    case "TOGGLE_AUTOPLAY": {
      const entering = !state.autoplayMode;
      return {
        ...state,
        autoplayMode: entering,
        isPlaying: entering ? state.isPlaying : false,
      };
    }
    default:
      return state;
  }
}
