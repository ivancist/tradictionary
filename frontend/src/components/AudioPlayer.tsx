import { useRef, useState } from 'react';
import { HiOutlineVolumeUp, HiOutlinePause } from 'react-icons/hi';

interface Props {
  audioUrl: string;
  label?: string;
}

export default function AudioPlayer({ audioUrl, label }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      try {
        audio.src = audioUrl;
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={loading}
          className={`
            flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200
            ${playing
              ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
              : 'bg-surface-700/60 text-primary-400 hover:bg-primary-500/20 hover:text-primary-300'
            }
            ${loading ? 'animate-pulse-soft' : ''}
            disabled:opacity-50
          `}
        >
          {playing ? (
            <HiOutlinePause className="w-5 h-5" />
          ) : (
            <HiOutlineVolumeUp className="w-5 h-5" />
          )}
        </button>
        <div>
          <p className="text-sm font-medium text-surface-200/90">
            {label || 'Pronunciation'}
          </p>
          <p className="text-xs text-surface-200/50">
            {loading ? 'Loading...' : playing ? 'Playing' : 'Click to play'}
          </p>
        </div>
      </div>
      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      />
    </div>
  );
}
