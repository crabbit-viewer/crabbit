import { useContext } from "react";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { MediaPost } from "../types";

function TileThumbnail({ post }: { post: MediaPost }) {
  const url = post.media[0]?.url;

  if (post.media_type === "embed" || !url) {
    return (
      <div className="w-full h-full bg-white/[0.05] flex flex-col items-center justify-center gap-2 px-4">
        <svg className="w-8 h-8 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-white/20 text-xs text-center line-clamp-2">{post.title}</span>
      </div>
    );
  }

  if (post.media_type === "video" || post.media_type === "animated_gif") {
    return (
      <>
        {post.thumbnail_url ? (
          <img src={post.thumbnail_url} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <video
            src={url}
            preload="metadata"
            muted
            className="w-full h-full object-cover pointer-events-none"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <svg className="w-5 h-5 text-white/80 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </>
    );
  }

  if (post.media_type === "gallery") {
    return (
      <>
        <img src={url} className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 flex items-center gap-1">
          <svg className="w-3 h-3 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="15" height="15" rx="2" />
            <path d="M7 2h13a2 2 0 012 2v13" />
          </svg>
          <span className="text-white/70 text-[10px] font-medium">{post.media.length}</span>
        </div>
      </>
    );
  }

  // image
  return <img src={url} className="w-full h-full object-cover" loading="lazy" />;
}

export function SavedGridView() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);

  const openPost = (index: number) => {
    dispatch({ type: "SET_INDEX", payload: index });
    dispatch({ type: "SET_SAVED_DISPLAY_MODE", payload: "slideshow" });
  };

  if (state.posts.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/30 text-base tracking-wide">
        No saved posts yet
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto pt-12 pb-4 px-4">
      <div className="grid grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[1920px]:grid-cols-7 min-[2400px]:grid-cols-8 gap-3">
        {state.posts.map((post, index) => (
          <button
            key={post.id}
            onClick={() => openPost(index)}
            className="group relative rounded-xl overflow-hidden bg-[var(--surface-2)] border border-white/[0.06] hover:border-white/[0.15] transition-all duration-200 hover:shadow-lg hover:shadow-black/30 hover:scale-[1.02] text-left"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-black">
              <TileThumbnail post={post} />
            </div>
            <div className="px-3 py-2">
              <p className="text-white/70 text-xs line-clamp-1 group-hover:text-white transition-colors">
                {post.title}
              </p>
              <p className="text-white/30 text-[10px] mt-0.5">
                r/{post.subreddit}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
