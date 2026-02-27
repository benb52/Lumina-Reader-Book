import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { db } from '../lib/db';
import { BookA, Trash2, Search, BookOpen } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function Vocabulary() {
  const vocabulary = useStore((state) => state.vocabulary);
  const setVocabulary = useStore((state) => state.setVocabulary);
  const removeVocabularyWord = useStore((state) => state.removeVocabularyWord);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadVocab = async () => {
      const words = await db.getVocabulary();
      setVocabulary(words);
      setIsLoading(false);
    };
    loadVocab();
  }, [setVocabulary]);

  const handleDelete = async (id: string) => {
    removeVocabularyWord(id);
    await db.deleteVocabularyWord(id);
  };

  const filteredWords = vocabulary.filter(w => 
    w.word.toLowerCase().includes(searchTerm.toLowerCase()) || 
    w.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 flex items-center gap-3">
            <BookA className="text-blue-500" />
            My Vocabulary
          </h1>
          <p className="text-zinc-500 mt-1">Words you've saved while reading.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            placeholder="Search words..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-zinc-200 border-dashed">
          <div className="bg-zinc-50 p-4 rounded-full mb-4">
            <BookA size={32} className="text-zinc-400" />
          </div>
          <h2 className="text-xl font-medium text-zinc-900 mb-2">No words found</h2>
          <p className="text-zinc-500 max-w-md">
            {searchTerm ? "No words match your search." : "You haven't saved any words yet. While reading, select a word and click the definition icon to save it."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-8">
          {filteredWords.map((item) => (
            <div key={item.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow group flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold text-zinc-900">{item.word}</h3>
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  title="Remove word"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-zinc-700 mb-4 flex-1">{item.definition}</p>
              
              {item.context && (
                <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100 mt-auto">
                  <p className="text-sm text-zinc-600 italic">"{item.context}"</p>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1 text-xs text-zinc-400">
                <BookOpen size={12} />
                <span>Saved on {new Date(item.addedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
