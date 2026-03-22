interface Props {
  embedUrl: string;
}

export function EmbedSlide({ embedUrl }: Props) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <iframe
        src={embedUrl}
        className="w-full h-full"
        allowFullScreen
        allow="autoplay; encrypted-media"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
