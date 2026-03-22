import { MediaItem } from "../types";

interface Props {
  item: MediaItem;
}

export function ImageSlide({ item }: Props) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <img
        src={item.url}
        alt=""
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
    </div>
  );
}
