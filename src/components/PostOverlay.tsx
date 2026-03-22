import { MediaPost } from "../types";

interface Props {
  post: MediaPost;
  visible: boolean;
}

export function PostOverlay({ post, visible }: Props) {
  if (!visible) return null;

  return (
    <div className="absolute bottom-16 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 py-4 pointer-events-none">
      <h2 className="text-white text-lg font-medium leading-tight line-clamp-2">
        {post.title}
      </h2>
      <div className="flex gap-4 text-white/60 text-sm mt-1">
        <span>r/{post.subreddit}</span>
        <span>u/{post.author}</span>
        <span>{formatScore(post.score)}</span>
        <span>{post.num_comments} comments</span>
      </div>
    </div>
  );
}

function formatScore(score: number): string {
  if (score >= 10000) return (score / 1000).toFixed(1) + "k";
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return String(score);
}
