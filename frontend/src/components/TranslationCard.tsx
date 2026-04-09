import type { TranslationResponse } from '../types';
import { HiOutlineTranslate } from 'react-icons/hi';

interface Props {
  data: TranslationResponse;
}

export default function TranslationCard({ data }: Props) {
  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineTranslate className="w-5 h-5 text-primary-400" />
        <h3 className="text-sm font-semibold text-primary-300 uppercase tracking-wider">Translation</h3>
        <span className="ml-auto text-xs text-surface-200/50">
          {data.source_lang} → {data.target_lang}
        </span>
      </div>

      <p className="text-lg text-gray-100 font-medium leading-relaxed">
        {data.translated_text}
      </p>

      {data.examples.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-surface-200/60 uppercase tracking-wider">Examples</p>
          {data.examples.map((ex, i) => (
            <p key={i} className="text-sm text-surface-200/80 italic pl-3 border-l-2 border-primary-600/40">
              {ex}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
