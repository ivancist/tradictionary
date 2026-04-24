import type { TranslationResponse } from '../types';
import { HiOutlineTranslate, HiOutlineChatAlt } from 'react-icons/hi';

interface Props {
  data: TranslationResponse;
}

export default function TranslationCard({ data }: Props) {
  const isExamplesOnly = data.is_examples_only;

  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        {isExamplesOnly ? (
          <HiOutlineChatAlt className="w-5 h-5 text-primary-400" />
        ) : (
          <HiOutlineTranslate className="w-5 h-5 text-primary-400" />
        )}
        <h3 className="text-sm font-semibold text-primary-300 uppercase tracking-wider">
          {isExamplesOnly ? 'Examples' : 'Translation'}
        </h3>
        <span className="ml-auto text-xs text-surface-200/50">
          {data.source_lang} → {data.target_lang}
        </span>
      </div>

      {!isExamplesOnly ? (
        <>
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
        </>
      ) : (
        <div className="space-y-3 mt-1">
          {data.examples.length > 0 ? (
            data.examples.map((ex, i) => {
              // Balanced-parenthesis splitter: find the outermost (...) prefix tag
              let ctxTag = '';
              let sentence = ex;
              if (ex.startsWith('(')) {
                let depth = 0, end = -1;
                for (let j = 0; j < ex.length; j++) {
                  if (ex[j] === '(') depth++;
                  else if (ex[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
                }
                if (end !== -1) {
                  ctxTag = ex.slice(0, end + 1);
                  sentence = ex.slice(end + 1).trim();
                }
              }
              if (ctxTag) {
                return (
                  <div key={i} className="pl-3 border-l-2 border-primary-600/40 py-0.5">
                    <span className="text-xs font-bold text-primary-400/80 uppercase tracking-wider block mb-0.5">{ctxTag}</span>
                    <p className="text-sm text-surface-200/90 italic leading-relaxed">{sentence}</p>
                  </div>
                );
              }
              return (
                <p key={i} className="text-sm text-surface-200/90 italic pl-3 border-l-2 border-primary-600/40 py-0.5">
                  {ex}
                </p>
              );
            })
          ) : (
            <p className="text-sm text-surface-200/40 italic">No examples found.</p>
          )}
        </div>
      )}
    </div>
  );
}
