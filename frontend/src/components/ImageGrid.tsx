import type { ImageResult } from '../types';
import { HiOutlinePhotograph } from 'react-icons/hi';
import { useState } from 'react';

interface Props {
  images: ImageResult[];
}

export default function ImageGrid({ images }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlinePhotograph className="w-5 h-5 text-pink-400" />
        <h3 className="text-sm font-semibold text-pink-300 uppercase tracking-wider">Images</h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {images.map((img, i) => (
          <button
            key={i}
            className="relative aspect-square rounded-lg overflow-hidden border border-surface-700/30 hover:border-primary-500/50 transition-all duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            title={img.title}
          >
            <img
              src={img.thumbnail || img.url}
              alt={img.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </button>
        ))}
      </div>

      {/* Expanded image overlay */}
      {expandedIdx !== null && images[expandedIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setExpandedIdx(null)}
        >
          <img
            src={images[expandedIdx].url}
            alt={images[expandedIdx].title}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
          <p className="absolute bottom-6 text-sm text-white/70">{images[expandedIdx].title}</p>
        </div>
      )}
    </div>
  );
}
