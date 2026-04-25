import { useState } from "react";

interface Props {
  embedUrl: string;
}

export function EmbedSlide({ embedUrl }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex items-center justify-center w-full h-full">
      <iframe
        key={embedUrl}
        src={embedUrl}
        className="w-full h-full"
        style={{ visibility: loaded ? "visible" : "hidden" }}
        allowFullScreen
        allow="autoplay; encrypted-media"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
