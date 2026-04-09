import type { DefinitionResponse } from '../types';
import { HiOutlineBookOpen } from 'react-icons/hi';

interface Props {
  data: DefinitionResponse;
}

export default function DefinitionCard({ data }: Props) {
  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineBookOpen className="w-5 h-5 text-emerald-400" />
        <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">Definition</h3>
        {data.source && (
          <span className="ml-auto text-xs text-surface-200/40 italic">{data.source}</span>
        )}
      </div>

      {data.phonetic && (
        <p className="text-sm text-surface-200/70 mb-3 font-mono">{data.phonetic}</p>
      )}

      <div className="space-y-3">
        {data.meanings.map((m, i) => (
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
