import { useState, useRef } from 'react';
import type { DefinitionResponse } from '../types';
import { HiOutlineBookOpen, HiOutlineSwitchHorizontal, HiOutlineVolumeUp } from 'react-icons/hi';

interface Props {
  sourceData?: DefinitionResponse;
  targetData?: DefinitionResponse;
  sourceLang: string;
  targetLang: string;
}

function InlineAudio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <>
      <button 
        onClick={play} 
        className={`ml-2 text-primary-400 hover:text-primary-300 transition-colors ${playing ? 'animate-pulse' : ''}`}
        title="Listen to pronunciation"
      >
        <HiOutlineVolumeUp className="w-4 h-4" />
      </button>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
    </>
  );
}

export default function DefinitionCard({ sourceData, targetData, sourceLang, targetLang }: Props) {
  const [showTarget, setShowTarget] = useState(false);

  // Determine which data to show. Fallback to the other if the requested one is missing yet.
  const activeData = showTarget 
    ? (targetData || sourceData) 
    : (sourceData || targetData);
    
  if (!activeData) return null;

  const handleToggle = () => {
    // Only toggle if both are available, or just let it toggle 
    setShowTarget(!showTarget);
  };

  const isShowingTarget = activeData === targetData;

  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-5 animate-fade-in relative">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineBookOpen className="w-5 h-5 text-emerald-400" />
        <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">Definition</h3>
        
        {sourceData && targetData && (
          <button 
            onClick={handleToggle}
            className="ml-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-700/50 hover:bg-surface-700 text-xs text-surface-200 transition-colors"
            title="Switch Language"
          >
            <HiOutlineSwitchHorizontal className="w-3.5 h-3.5" />
            <span className="uppercase font-medium">{activeData === sourceData ? (sourceLang === 'auto' ? 'en' : sourceLang) : targetLang}</span>
          </button>
        )}

        {activeData.source && (
          <span className="ml-auto text-[10px] text-surface-200/40 italic uppercase tracking-wider">{activeData.source}</span>
        )}
      </div>

      {(activeData.phonetic || activeData.source_audio_url) && (
        <div className="flex items-center mb-3">
          {activeData.phonetic && (
            <p className="text-sm text-surface-200/70 font-mono">{activeData.phonetic}</p>
          )}
          {activeData.source_audio_url && <InlineAudio url={activeData.source_audio_url} />}
        </div>
      )}

      <div className="space-y-3">
        {activeData.meanings.map((m, i) => (
          <div key={i}>
            <span className="inline-block text-xs font-semibold text-amber-400/80 bg-amber-400/10 rounded-full px-2.5 py-0.5 mb-1.5">
              {m.part_of_speech}
            </span>
            <ol className="list-decimal list-inside space-y-1">
              {m.definitions.map((def, j) => (
                <li key={j} className="text-sm text-surface-200/90 leading-relaxed">
                  {def}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
