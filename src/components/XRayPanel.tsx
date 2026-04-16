import { X, Zap, User, MapPin, BookOpen, Sparkles } from 'lucide-react';
import { Button } from './ui/Button';

interface XRayData {
  characters: { name: string; role: string; description: string }[];
  themes: string[];
  glossary: { term: string; definition: string }[];
  speakerVoices?: { [name: string]: string };
}

export default function XRayPanel({ 
  data, 
  onClose,
  onUpdateVoice
}: { 
  data?: XRayData, 
  onClose: () => void,
  onUpdateVoice?: (name: string, voice: string) => void
}) {
  const voices = [
    { id: 'Puck', label: 'Puck (Male)' },
    { id: 'Charon', label: 'Charon (Male)' },
    { id: 'Kore', label: 'Kore (Female)' },
    { id: 'Fenrir', label: 'Fenrir (Male)' },
    { id: 'Zephyr', label: 'Zephyr (Female)' },
    { id: 'Aoede', label: 'Aoede (Female)' },
    { id: 'Orpheus', label: 'Orpheus (Male)' },
    { id: 'Cassiopeia', label: 'Cassiopeia (Female)' }
  ];

  return (
    <div className="fixed md:absolute inset-y-0 right-0 w-full md:w-80 bg-white border-l border-zinc-200 shadow-xl flex flex-col z-[60] animate-in slide-in-from-right-full md:slide-in-from-right">
      <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
        <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
          <Zap size={18} className="text-yellow-500" />
          X-Ray
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {!data ? (
          <div className="text-center text-zinc-500 mt-10 text-sm">
            AI analysis not available for this book.
          </div>
        ) : (
          <>
            {data.speakerVoices && Object.keys(data.speakerVoices).length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles size={16} className="text-emerald-500" /> Character Voices
                </h3>
                <div className="space-y-2">
                  {Object.entries(data.speakerVoices).map(([name, voice]) => (
                    <div key={name} className="flex items-center justify-between bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="text-xs font-medium text-zinc-900">{name}</span>
                      <select 
                        value={voice || 'Kore'} 
                        onChange={(e) => onUpdateVoice?.(name, e.target.value)}
                        className="text-[10px] bg-white border border-emerald-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <User size={16} className="text-zinc-400" /> Characters
              </h3>
              <div className="space-y-3">
                {data.characters?.map((char, i) => (
                  <div key={i} className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <div className="font-medium text-zinc-900 text-sm">{char.name}</div>
                    <div className="text-xs text-zinc-500 mb-1">{char.role}</div>
                    <div className="text-xs text-zinc-600 leading-relaxed">{char.description}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <MapPin size={16} className="text-zinc-400" /> Themes
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.themes?.map((theme, i) => (
                  <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                    {theme}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <BookOpen size={16} className="text-zinc-400" /> Glossary
              </h3>
              <div className="space-y-3">
                {data.glossary?.map((item, i) => (
                  <div key={i} className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <div className="font-medium text-zinc-900 text-sm">{item.term}</div>
                    <div className="text-xs text-zinc-600 leading-relaxed mt-1">{item.definition}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
