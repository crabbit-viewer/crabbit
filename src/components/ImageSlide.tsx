import { MediaItem } from "../types";

interface Props {
  item: MediaItem;
}

export function ImageSlide({ item }: Props) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <img
        key={item.url}
        src={item.url}
        alt=""
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  );
}
