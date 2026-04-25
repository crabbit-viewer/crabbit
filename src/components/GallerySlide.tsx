import { useContext } from "react";
import { MediaItem } from "../types";
import { AppStateContext, AppDispatchContext } from "../state/context";

interface Props {
  items: MediaItem[];
}

export function GallerySlide({ items }: Props) {
  const { galleryIndex } = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const item = items[galleryIndex];

  if (!item) return null;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full relative">
      <img
        src={item.url}
        alt=""
        className="w-full h-[calc(100%-3rem)] object-contain"
        draggable={false}
      />
      {item.caption && (
        <p className="text-white/80 text-sm mt-1 px-4 text-center truncate max-w-xl">
          {item.caption}
        </p>
      )}
      <div className="absolute bottom-4 flex gap-1.5 items-center bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
        {items.length <= 10 ? (
          items.map((_, i) => (
            <button
              key={i}
              className={`rounded-full transition-all duration-200 ${
                i === galleryIndex
                  ? "w-2.5 h-2.5 bg-white ring-1 ring-white/20"
                  : "w-2 h-2 bg-white/40 hover:bg-white/60"
              }`}
              onClick={() => dispatch({ type: "SET_GALLERY_INDEX", payload: i })}
            />
          ))
        ) : null}
        <span className="text-white/60 text-xs ml-1 tabular-nums font-mono">
          {galleryIndex + 1}/{items.length}
        </span>
      </div>
    </div>
  );
}
