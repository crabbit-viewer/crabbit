import { MediaPost } from "../types";

interface Props {
  post: MediaPost;
  visible: boolean;
  uiVisible: boolean;
}

export function PostOverlay({ post, visible, uiVisible }: Props) {
  if (!visible) return null;

  const chromeClass = `ui-chrome ${uiVisible ? "" : "ui-hidden"}`;

  return (
    <div className={`absolute bottom-10 left-0 px-4 py-3 pointer-events-none ${chromeClass}`}>
      <p className="text-white/70 text-xs leading-snug line-clamp-1 max-w-[600px]">
        {post.title}
      </p>
      <div className="flex gap-3 text-white/30 text-[10px] mt-0.5">
        <span>r/{post.subreddit}</span>
        <span>u/{post.author}</span>
        <span>{formatScore(post.score)}</span>
      </div>
    </div>
  );
}

function formatScore(score: number): string {
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return String(score);
}
