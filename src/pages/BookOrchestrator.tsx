import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, X, ChevronLeft, ChevronRight, Trash, Plus, Bold, Underline, Sparkles, Loader2, User, Volume2, Play } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';
import { analyzeSpeakers, analyzeSpeakersBatch, generateSpeech } from '../services/ai';
import { cn } from '../lib/utils';

const AVAILABLE_VOICES = [
  { id: 'Kore', name: 'Kore', description: 'Young Female' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Calm Female' },
  { id: 'Puck', name: 'Puck', description: 'Playful Neutral' },
  { id: 'Charon', name: 'Charon', description: 'Mature Male' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Strong Male' },
  { id: 'Aoede', name: 'Aoede', description: 'Vibrant Female' },
];

export default function BookOrchestrator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const updateBook = useStore((state) => state.updateBook);
  const isWaitingForQuota = useStore((state) => state.isWaitingForQuota);
  const settings = useStore((state) => state.settings);
  const apiKey = settings.apiKey;
  
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageToDelete, setPageToDelete] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bookTitle, setBookTitle] = useState<string>('');
  const [bookAuthor, setBookAuthor] = useState<string>('');
  const [bookCoverUrl, setBookCoverUrl] = useState<string>('');
  const [bookLanguage, setBookLanguage] = useState<string>('');
  const [textDirection, setTextDirection] = useState<'ltr' | 'rtl'>('ltr');

  const [isDramatizingFullBook, setIsDramatizingFullBook] = useState(false);
  const [dramatizationProgress, setDramatizationProgress] = useState(0);
  const [cancelDramatization, setCancelDramatization] = useState(false);
  const cancelRef = useRef(false);
  const [showDramatizeConfirm, setShowDramatizeConfirm] = useState(false);
  
  const [speakerVoices, setSpeakerVoices] = useState<{ [name: string]: string }>({});
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const existingProgress = book?.dramatization?.pages && pages.length > 0
    ? Math.round((Object.keys(book.dramatization.pages).length / pages.length) * 100)
    : 0;

  useEffect(() => {
    if (id) {
      loadBook(id);
    }
  }, [id]);

  const loadBook = async (bookId: string) => {
    const b = await db.getBook(bookId);
    if (b) {
      setBook(b);
      setBookTitle(b.title || '');
      setBookAuthor(b.author || '');
      setBookCoverUrl(b.coverUrl || '');
      setBookLanguage(b.language || '');
      setTextDirection(b.textDirection || 'ltr');
      
      const voices = b.dramatization?.speakerVoices || {};
      const genders = b.dramatization?.speakerGenders || {};
      if (b.dramatization && !voices['Narrator']) {
        voices['Narrator'] = 'Zephyr';
        genders['Narrator'] = 'female';
      }
      setSpeakerVoices(voices);
      
      // Split content by our marker
      const pgs = b.content.split('<<LUMINA_PAGE_BREAK>>').filter(p => p.trim() !== '');
      // Clean up <<PAGE:X>> markers for editing
      const cleanedPages = pgs.map(p => p.replace(/<<PAGE:\d+>>/g, '').trim());
      setPages(cleanedPages.length > 0 ? cleanedPages : ['']);
    } else {
      navigate('/');
    }
  };

  const handlePageChange = (index: number) => {
    setCurrentPageIndex(index);
  };

  const handleContentChange = (newContent: string) => {
    const newPages = [...pages];
    newPages[currentPageIndex] = newContent;
    setPages(newPages);
  };

  const handleFormatText = (format: 'bold' | 'underline') => {
    const textarea = document.getElementById('page-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return; // No text selected

    const selectedText = pages[currentPageIndex].substring(start, end);
    let newText = '';

    if (format === 'bold') {
      newText = `<<BOLD_START>>${selectedText}<<BOLD_END>>`;
    } else if (format === 'underline') {
      newText = `<<UNDERLINE_START>>${selectedText}<<UNDERLINE_END>>`;
    }

    const newContent = pages[currentPageIndex].substring(0, start) + newText + pages[currentPageIndex].substring(end);
    handleContentChange(newContent);
    
    // Restore selection after state update (setTimeout to wait for render)
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + newText.length);
    }, 0);
  };

  const handleAddPage = () => {
    const newPages = [...pages];
    newPages.splice(currentPageIndex + 1, 0, '');
    setPages(newPages);
    setCurrentPageIndex(currentPageIndex + 1);
  };

  const handleDeletePage = () => {
    if (pages.length <= 1) {
      setErrorMessage("Cannot delete the last page.");
      return;
    }
    setPageToDelete(true);
  };

  const confirmDeletePage = () => {
    const newPages = pages.filter((_, i) => i !== currentPageIndex);
    setPages(newPages);
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
    setPageToDelete(false);
  };

  const handleSave = async () => {
    if (!book) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      // Reconstruct content with markers
      const content = pages.map((p, i) => `<<PAGE:${i + 1}>>\n${p}`).join('\n<<LUMINA_PAGE_BREAK>>\n');
      
      // Update dramatization with current speaker voices
      const updatedDramatization = {
        ...(book.dramatization || { pages: {} }),
        speakerVoices: speakerVoices,
        speakerGenders: book.dramatization?.speakerGenders || {}
      };

      const updatedBook = { 
        ...book, 
        title: bookTitle,
        author: bookAuthor,
        coverUrl: bookCoverUrl,
        content,
        totalPages: pages.length,
        language: bookLanguage,
        textDirection,
        dramatization: updatedDramatization
      };
      await db.saveBook(updatedBook);
      updateBook(book.id, { 
        title: bookTitle,
        author: bookAuthor,
        coverUrl: bookCoverUrl,
        content,
        totalPages: updatedBook.totalPages,
        language: bookLanguage,
        textDirection,
        dramatization: updatedDramatization
      });
      navigate('/', { state: { message: `Book "${bookTitle}" saved successfully!` } });
    } catch (err) {
      console.error('Failed to save book', err);
      setErrorMessage('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCleanText = (text: string) => {
    return text
      .replace(/<<PAGE:\d+>>/g, '')
      .replace(/<<BOLD_START>>/g, '')
      .replace(/<<BOLD_END>>/g, '')
      .replace(/<<UNDERLINE_START>>/g, '')
      .replace(/<<UNDERLINE_END>>/g, '')
      .replace(/<<QUOTE_START>>/g, '')
      .replace(/<<QUOTE_END>>/g, '')
      .trim();
  };

  const handleDramatizeFullBook = async (startFresh: boolean = false) => {
    if (!book || !apiKey || pages.length === 0) {
      if (!apiKey) setErrorMessage('API Key is required for AI analysis.');
      return;
    }
    
    setShowDramatizeConfirm(false);
    setIsDramatizingFullBook(true);
    setDramatizationProgress(startFresh ? 0 : existingProgress);
    setCancelDramatization(false);
    cancelRef.current = false;
    
    let currentSpeakerVoices = startFresh ? { Narrator: 'Zephyr' } : { Narrator: 'Zephyr', ...(book.dramatization?.speakerVoices || {}) };
    let currentSpeakerGenders = startFresh ? { Narrator: 'female' } : { Narrator: 'female', ...(book.dramatization?.speakerGenders || {}) };
    let currentPagesDramatization = startFresh ? {} : { ...(book.dramatization?.pages || {}) };
    let latestBook = book;
    
    const BATCH_SIZE = 1;
    let batchCount = 0;

    let hasError = false;

    try {
      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        if (cancelRef.current) break;
        batchCount++;

        let newlyMarkedEmpty = false;
        const batchPages: { index: number, text: string }[] = [];
        for (let j = 0; j < BATCH_SIZE && (i + j) < pages.length; j++) {
          const pageIdx = i + j;
          // Skip pages that are already dramatized if not starting fresh
          if (!startFresh && currentPagesDramatization[pageIdx]) {
            continue;
          }
          const cleanText = getCleanText(pages[pageIdx]);
          if (cleanText.trim()) {
            batchPages.push({ index: pageIdx, text: cleanText });
          } else {
            // Mark empty pages as dramatized with empty segments so they count towards progress
            currentPagesDramatization[pageIdx] = { segments: [] };
            newlyMarkedEmpty = true;
          }
        }

        if (batchPages.length === 0) {
          if (newlyMarkedEmpty) {
            // If we marked some empty pages, save them
            const updatedDramatization = {
              pages: currentPagesDramatization,
              speakerVoices: currentSpeakerVoices,
              speakerGenders: currentSpeakerGenders
            };
            const updatedBook = { ...latestBook, dramatization: updatedDramatization };
            latestBook = updatedBook;
            setBook(updatedBook);
            updateBook(book.id, { dramatization: updatedDramatization });
            
            // Throttle Firestore saves: only save every 3 batches or at the end
            if (batchCount % 3 === 0 || i + BATCH_SIZE >= pages.length) {
              await db.saveBook(updatedBook);
            }
          }

          const totalDone = Object.keys(currentPagesDramatization).length;
          setDramatizationProgress(Math.min(100, Math.round((totalDone / pages.length) * 100)));
          continue;
        }

        // Add a small delay between requests to proactively avoid rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const result = await analyzeSpeakersBatch(batchPages, apiKey, currentSpeakerVoices, bookLanguage);
        
        if (result && result.pages) {
          const newSpeakerVoices = { ...currentSpeakerVoices, ...(result.newSpeakerVoices || {}) };
          const newSpeakerGenders = { ...currentSpeakerGenders, ...(result.speakerGenders || {}) };
          currentSpeakerVoices = newSpeakerVoices;
          currentSpeakerGenders = newSpeakerGenders;
          setSpeakerVoices(newSpeakerVoices);

          result.pages.forEach((pageData: any) => {
            const segmentsWithVoices = pageData.segments.map((s: any) => ({
              ...s,
              voice: newSpeakerVoices[s.speaker] || 'Kore'
            }));
            currentPagesDramatization[pageData.pageIndex] = { segments: segmentsWithVoices };
          });

          // Save incrementally
          const updatedDramatization = {
            pages: currentPagesDramatization,
            speakerVoices: currentSpeakerVoices,
            speakerGenders: currentSpeakerGenders
          };
          const updatedBook = { ...latestBook, dramatization: updatedDramatization };
          latestBook = updatedBook;
          setBook(updatedBook);
          updateBook(book.id, { dramatization: updatedDramatization });
          
          // Throttle Firestore saves: only save every 3 batches or at the end
          if (batchCount % 3 === 0 || i + BATCH_SIZE >= pages.length) {
            await db.saveBook(updatedBook);
            // Give the write stream a moment to breathe after a large write
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        const totalDone = Object.keys(currentPagesDramatization).length;
        setDramatizationProgress(Math.min(100, Math.round((totalDone / pages.length) * 100)));
      }
      
      if (!cancelRef.current) {
        setDramatizationProgress(100);
      }
    } catch (err: any) {
      hasError = true;
      console.error("Full book dramatization failed", err);
      const errorStr = (err?.message || JSON.stringify(err)).toLowerCase();
      if (errorStr.includes('429') || errorStr.includes('resource_exhausted') || errorStr.includes('quota') || errorStr.includes('limit')) {
        setErrorMessage("Gemini API quota exceeded. This usually happens with free API keys. Progress has been saved. You can resume later by clicking 'Continue Dramatization'.");
      } else {
        setErrorMessage("Failed to dramatize full book. Progress has been saved. Please check your connection and try again.");
      }
    } finally {
      // Final save to ensure everything is in the store and DB
      // Only do this if we aren't already finishing normally (which saves in the loop)
      // or if we were cancelled/errored.
      if (latestBook && (cancelRef.current || hasError)) {
        setBook(latestBook);
        await db.saveBook(latestBook);
        updateBook(book.id, { dramatization: latestBook.dramatization });
      }
      setIsDramatizingFullBook(false);
      setCancelDramatization(false);
    }
  };

  const handleVoiceChange = (speaker: string, voice: string) => {
    setSpeakerVoices(prev => ({ ...prev, [speaker]: voice }));
  };

  const previewVoice = async (voiceName: string) => {
    if (!apiKey) return;
    setIsPreviewingVoice(voiceName);
    try {
      const text = `Hello, I am ${voiceName}. This is how I sound in the dramatized reading.`;
      const base64Audio = await generateSpeech(text, voiceName, apiKey);
      
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        
        // Gemini TTS returns raw 16-bit PCM Mono at 24kHz.
        // decodeAudioData expects a container (WAV/MP3), so we decode manually.
        const int16 = new Int16Array(audioData.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }
        
        const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
        audioBuffer.copyToChannel(float32, 0);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        source.onended = () => setIsPreviewingVoice(null);
      } else {
        setIsPreviewingVoice(null);
      }
    } catch (err) {
      console.error("Failed to preview voice", err);
      setIsPreviewingVoice(null);
      setErrorMessage("Failed to preview voice. Quota might be exceeded.");
    }
  };

  if (!book) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 relative">
      {errorMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-lg min-w-[300px]">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 ml-4">
            <X size={16} />
          </button>
        </div>
      )}

      {pageToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-auto">
            <h3 className="text-xl font-semibold text-zinc-900 mb-2">Delete Page</h3>
            <p className="text-zinc-600 mb-6">Are you sure you want to delete this page? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPageToDelete(false)}>Cancel</Button>
              <Button onClick={confirmDeletePage} className="bg-red-600 hover:bg-red-700 text-white border-transparent">Delete</Button>
            </div>
          </div>
        </div>
      )}

      {showDramatizeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full mx-auto">
            <div className="bg-purple-100 text-purple-600 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
              <Sparkles size={24} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">AI Dramatization</h3>
            <p className="text-zinc-600 mb-4 leading-relaxed">
              AI will analyze the entire book to identify characters and assign professional voices. 
            </p>
            {existingProgress > 0 && existingProgress < 100 && (
              <div className="mb-6 p-4 bg-purple-50 rounded-2xl border border-purple-100">
                <div className="flex justify-between text-sm font-bold text-purple-700 mb-2">
                  <span>Current Progress</span>
                  <span>{existingProgress}%</span>
                </div>
                <div className="w-full bg-purple-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-purple-600 h-full transition-all" style={{ width: `${existingProgress}%` }} />
                </div>
              </div>
            )}
            <p className="text-zinc-600 mb-8 leading-relaxed">
              How would you like to proceed?
            </p>
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => handleDramatizeFullBook(false)}
                className="bg-purple-600 hover:bg-purple-700 text-white border-transparent py-6 rounded-2xl"
              >
                {existingProgress > 0 ? 'Continue Dramatization' : 'Start Dramatization'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => handleDramatizeFullBook(true)}
                className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 py-6 rounded-2xl"
              >
                Start Fresh (Reset All Voices)
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setShowDramatizeConfirm(false)}
                className="text-zinc-400 mt-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white border-b border-zinc-200 shrink-0 gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ChevronLeft size={20} />
          </Button>
          <div>
            <h1 className="font-semibold text-zinc-900 leading-tight line-clamp-1">Edit: {book.title}</h1>
            <p className="text-xs text-zinc-500">Book Orchestrator</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 mr-4">
            <label className="text-sm text-zinc-600">Direction:</label>
            <select
              value={textDirection}
              onChange={(e) => setTextDirection(e.target.value as 'ltr' | 'rtl')}
              className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            >
              <option value="ltr">Left-to-Right</option>
              <option value="rtl">Right-to-Left</option>
            </select>
          </div>
          <div className="flex items-center gap-2 mr-4">
            <label className="text-sm text-zinc-600">Language:</label>
            <select
              value={bookLanguage}
              onChange={(e) => {
                setBookLanguage(e.target.value);
                if (e.target.value === 'Hebrew') {
                  setTextDirection('rtl');
                } else {
                  setTextDirection('ltr');
                }
              }}
              className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            >
              <option value="Hebrew">Hebrew</option>
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setShowDramatizeConfirm(true)} 
            disabled={isDramatizingFullBook || isSaving}
            className={cn(
              "flex-1 sm:flex-none justify-center border-purple-200 text-purple-700 hover:bg-purple-50",
              isDramatizingFullBook && "animate-pulse"
            )}
          >
            <Sparkles size={16} className="mr-2" /> 
            {isDramatizingFullBook 
              ? `Dramatizing (${dramatizationProgress}%)` 
              : existingProgress > 0 && existingProgress < 100 
                ? `Continue Dramatization (${existingProgress}%)` 
                : existingProgress === 100 
                  ? 'Redo Dramatization' 
                  : 'Dramatize Book (AI)'}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/book/${book.id}`)} className="flex-1 sm:flex-none justify-center">
            <X size={16} className="mr-2" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex-1 sm:flex-none justify-center">
            {isSaving ? 'Saving...' : (
              <><Save size={16} className="mr-2" /> Save</>
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Book Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-700">Title</label>
              <input 
                type="text" 
                value={bookTitle} 
                onChange={(e) => setBookTitle(e.target.value)}
                className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-shadow"
                placeholder="Book Title"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-700">Author</label>
              <input 
                type="text" 
                value={bookAuthor} 
                onChange={(e) => setBookAuthor(e.target.value)}
                className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-shadow"
                placeholder="Author Name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-700">Cover Image URL</label>
              <input 
                type="text" 
                value={bookCoverUrl} 
                onChange={(e) => setBookCoverUrl(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-shadow"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <User size={16} className="text-purple-600" /> Character Voices
          </h2>
          {Object.keys(speakerVoices).length === 0 ? (
            <div className="text-center py-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
              <p className="text-sm text-zinc-500">No characters detected yet. Run "Dramatize Book (AI)" to identify characters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(speakerVoices).map(([speaker, voice]) => {
                const currentVoice = voice as string;
                return (
                  <div key={speaker} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100 group">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-zinc-900 truncate">{speaker}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <select
                          value={currentVoice}
                          onChange={(e) => handleVoiceChange(speaker, e.target.value)}
                          className="text-[11px] bg-transparent border-none p-0 focus:ring-0 text-zinc-500 cursor-pointer hover:text-purple-600 transition-colors"
                        >
                          {AVAILABLE_VOICES.map(v => (
                            <option key={v.id} value={v.id}>{v.name} ({v.description})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => previewVoice(currentVoice)}
                      disabled={isPreviewingVoice === currentVoice}
                      className="h-8 w-8 p-0 rounded-lg bg-white shadow-sm border border-zinc-100 hover:bg-purple-50 hover:text-purple-600 transition-all"
                    >
                      {isPreviewingVoice === currentVoice ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Volume2 size={14} />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 flex-1 flex flex-col min-h-[70vh]">
          <div className="p-3 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handlePageChange(currentPageIndex - 1)} disabled={currentPageIndex === 0}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-medium text-zinc-700">Page {currentPageIndex + 1} of {pages.length}</span>
              <Button variant="ghost" size="sm" onClick={() => handlePageChange(currentPageIndex + 1)} disabled={currentPageIndex === pages.length - 1}>
                <ChevronRight size={16} />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center border-r border-zinc-200 pr-2 mr-2">
                <Button variant="ghost" size="sm" onClick={() => handleFormatText('bold')} title="Bold" className="h-8 w-8 p-0">
                  <Bold size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleFormatText('underline')} title="Underline" className="h-8 w-8 p-0">
                  <Underline size={14} />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={handleAddPage} className="text-xs h-8">
                <Plus size={14} className="mr-1" /> Add Page
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeletePage} className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50" disabled={pages.length <= 1}>
                <Trash size={14} className="mr-1" /> Delete
              </Button>
            </div>
          </div>
          <div className="px-4 pt-2 pb-0">
            <p className="text-[11px] text-zinc-500 font-medium">
              Note: Formatting tags like &lt;&lt;BOLD_START&gt;&gt; will be rendered visually when reading the book.
            </p>
          </div>
          <textarea
            id="page-editor"
            value={pages[currentPageIndex] || ''}
            onChange={(e) => handleContentChange(e.target.value)}
            dir={textDirection}
            className="flex-1 w-full p-4 md:p-6 resize-y min-h-[60vh] focus:outline-none focus:ring-0 font-mono text-sm leading-relaxed text-zinc-800"
            spellCheck={false}
            placeholder="Enter page content here..."
          />

          {isDramatizingFullBook && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
                <div className="bg-purple-100 text-purple-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-bounce">
                  <Sparkles size={32} />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 mb-2">Dramatizing Book</h3>
                <p className="text-zinc-500 mb-8">
                  {isWaitingForQuota ? (
                    <span className="text-amber-600 font-medium flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Gemini API quota reached. Waiting to resume...
                    </span>
                  ) : (
                    "AI is analyzing characters and assigning professional voices. We're moving slowly to stay within API limits. This may take some time depending on the book length..."
                  )}
                </p>
                
                <div className="w-full bg-zinc-100 h-3 rounded-full overflow-hidden mb-4">
                  <div 
                    className="bg-purple-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${dramatizationProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm font-medium text-zinc-600 mb-8">
                  <span>Progress</span>
                  <span>{dramatizationProgress}%</span>
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => {
                    cancelRef.current = true;
                    setCancelDramatization(true);
                  }}
                  disabled={cancelDramatization}
                  className="w-full py-6 rounded-2xl border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                >
                  {cancelDramatization ? 'Cancelling...' : 'Cancel Analysis'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
