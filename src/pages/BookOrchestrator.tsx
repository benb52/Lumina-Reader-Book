import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, X, ChevronLeft, ChevronRight, Trash, Plus, Bold, Underline, Sparkles, Loader2, User, Volume2, Play, Check, Captions } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';
import { analyzeSpeakers, analyzeSpeakersBatch, generateSpeech, translateSentencesBatch, translateWordsBatch } from '../services/ai';
import { cn, getCleanText, getSentences, getUniqueWords } from '../lib/utils';

const getAvailableVoices = (isHebrew: boolean) => [
  { id: 'Kore', name: 'Kore', description: isHebrew ? 'אישה צעירה' : 'Young Female' },
  { id: 'Zephyr', name: 'Zephyr', description: isHebrew ? 'אישה רגועה' : 'Calm Female' },
  { id: 'Puck', name: 'Puck', description: isHebrew ? 'קול שובב' : 'Playful Neutral' },
  { id: 'Charon', name: 'Charon', description: isHebrew ? 'גבר בוגר' : 'Mature Male' },
  { id: 'Fenrir', name: 'Fenrir', description: isHebrew ? 'גבר חזק' : 'Strong Male' },
  { id: 'Aoede', name: 'Aoede', description: isHebrew ? 'אישה תוססת' : 'Vibrant Female' },
  { id: 'Orpheus', name: 'Orpheus', description: isHebrew ? 'גבר דרמטי' : 'Expressive Male' },
  { id: 'Cassiopeia', name: 'Cassiopeia', description: isHebrew ? 'אישה אלגנטית' : 'Elegant Female' },
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
  const [keriKetivEnabled, setKeriKetivEnabled] = useState<boolean>(true);
  const [isDramatizedReadingEnabled, setIsDramatizedReadingEnabled] = useState<boolean>(false);
  const [ttsProvider, setTtsProvider] = useState<'browser' | 'gemini'>('browser');
  const [aiChunkSizeMultiplier, setAiChunkSizeMultiplier] = useState<number>(1);
  const [geminiVoice, setGeminiVoice] = useState<'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede' | 'Orpheus' | 'Cassiopeia'>('Zephyr');
  const [targetSubtitleLanguage, setTargetSubtitleLanguage] = useState<string>('Hebrew');
  const [isSubtitleTranslationEnabled, setIsSubtitleTranslationEnabled] = useState<boolean>(false);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);
  const [subtitleProgress, setSubtitleProgress] = useState(0);
  const [cancelSubtitles, setCancelSubtitles] = useState(false);
  const [isGeneratingDictionary, setIsGeneratingDictionary] = useState(false);
  const [dictionaryProgress, setDictionaryProgress] = useState(0);
  const [cancelDictionary, setCancelDictionary] = useState(false);
  const [availableBrowserVoices, setAvailableBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableBrowserVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const [isDramatizingFullBook, setIsDramatizingFullBook] = useState(false);
  const [dramatizationProgress, setDramatizationProgress] = useState(0);
  const [cancelDramatization, setCancelDramatization] = useState(false);
  const cancelRef = useRef(false);
  const [showDramatizeConfirm, setShowDramatizeConfirm] = useState(false);
  
  const [speakerVoices, setSpeakerVoices] = useState<{ [name: string]: string }>({});
  const [speakerGenders, setSpeakerGenders] = useState<{ [name: string]: 'male' | 'female' | 'neutral' }>({});
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
      setKeriKetivEnabled(b.keriKetivEnabled !== false);
      setIsDramatizedReadingEnabled(!!b.isDramatizedReadingEnabled);
      setTtsProvider(b.ttsProvider || 'browser');
      setAiChunkSizeMultiplier(b.aiChunkSizeMultiplier || settings.aiChunkSizeMultiplier || 1);
      setGeminiVoice(b.geminiVoice || settings.geminiVoice || 'Zephyr');
      setTargetSubtitleLanguage(b.subtitleLanguage || settings.subtitleLanguage || 'Hebrew');
      setIsSubtitleTranslationEnabled(b.isSubtitleTranslationEnabled ?? settings.isSubtitleTranslationEnabled ?? false);
      
      const voices = b.dramatization?.speakerVoices || {};
      const genders = b.dramatization?.speakerGenders || {};
      if (!voices['Narrator']) {
        voices['Narrator'] = 'Zephyr';
        genders['Narrator'] = 'female';
      }
      setSpeakerVoices(voices);
      setSpeakerGenders(genders);
      
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

  const handleGenerateSubtitles = async (startFresh: boolean = false) => {
    if (!book || !apiKey || pages.length === 0) {
      if (!apiKey) setErrorMessage('API Key is required for translation.');
      return;
    }

    setIsGeneratingSubtitles(true);
    setCancelSubtitles(false);
    cancelRef.current = false;
    
    let currentSubtitles = startFresh ? {} : { ...(book.subtitles?.[targetSubtitleLanguage]?.pages || {}) };
    let currentWordMap = startFresh ? {} : { ...(book.subtitles?.[targetSubtitleLanguage]?.wordTranslations || {}) };
    let latestBook = book;
    
    const existingSubProgress = !startFresh && book.subtitles?.[targetSubtitleLanguage]?.pages
      ? Math.round((Object.keys(book.subtitles[targetSubtitleLanguage].pages).length / pages.length) * 100)
      : 0;
    
    setSubtitleProgress(existingSubProgress);

    const BATCH_SIZE = aiChunkSizeMultiplier;
    try {
      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        if (cancelRef.current) break;

        const batchPages: { index: number, sentences: string[] }[] = [];
        for (let j = 0; j < BATCH_SIZE && (i + j) < pages.length; j++) {
          const pageIdx = i + j;
          // Skip if already translated and not starting fresh
          if (!startFresh && currentSubtitles[pageIdx]) {
            continue;
          }

          const cleanText = getCleanText(pages[pageIdx]);
          if (!cleanText.trim()) {
            currentSubtitles[pageIdx] = [];
            continue;
          }

          // Split into sentences for better translation quality
          batchPages.push({ index: pageIdx, sentences: getSentences(cleanText) });
        }

        if (batchPages.length === 0) {
          setSubtitleProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / pages.length) * 100)));
          continue;
        }

        const allSentences = batchPages.flatMap(p => p.sentences);
        const { translations, wordMap } = await translateSentencesBatch(allSentences, targetSubtitleLanguage, apiKey);
        
        if (translations && translations.length > 0) {
          let offset = 0;
          batchPages.forEach(p => {
            currentSubtitles[p.index] = translations.slice(offset, offset + p.sentences.length);
            offset += p.sentences.length;
          });
        }

        if (wordMap) {
          // Normalize keys to lowercase
          Object.entries(wordMap).forEach(([word, trans]) => {
            currentWordMap[word.toLowerCase()] = trans as string;
          });
        }

        // Save incrementally every 5 batches to be safer and more efficient
        if (Math.floor(i / BATCH_SIZE) % 5 === 0 || i + BATCH_SIZE >= pages.length) {
          const updatedSubtitles = {
            ...(latestBook.subtitles || {}),
            [targetSubtitleLanguage]: {
              pages: currentSubtitles,
              wordTranslations: currentWordMap,
              lastUpdated: Date.now()
            }
          };
          const updatedBook = { ...latestBook, subtitles: updatedSubtitles };
          latestBook = updatedBook;
          setBook(updatedBook);
          updateBook(book.id, { subtitles: updatedSubtitles });
          await db.updateBookField(book.id, 'subtitles', updatedSubtitles);
        }

        setSubtitleProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / pages.length) * 100)));
        
        // Small delay to be kind to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error("Subtitle generation failed", err);
      setErrorMessage("Failed to generate subtitles. Progress has been saved.");
    } finally {
      if (latestBook && (cancelRef.current)) {
        setBook(latestBook);
        await db.saveBook(latestBook);
        updateBook(book.id, { subtitles: latestBook.subtitles });
      }
      setIsGeneratingSubtitles(false);
      setCancelSubtitles(false);
    }
  };

  const handleGenerateDictionary = async () => {
    if (!book || !apiKey || pages.length === 0) {
      if (!apiKey) setErrorMessage('API Key is required for translation.');
      return;
    }

    setIsGeneratingDictionary(true);
    setDictionaryProgress(0);
    setCancelDictionary(false);
    cancelRef.current = false;
    
    try {
      // 1. Extract all unique words from the book
      console.log(`[Dictionary] Extracting unique words from ${pages.length} pages...`);
      const startTime = Date.now();
      const fullText = pages.join(' ');
      const uniqueWords = getUniqueWords(fullText);
      const extractionTime = Date.now() - startTime;
      console.log(`[Dictionary] Found ${uniqueWords.length} unique words in ${extractionTime}ms.`);
      
      if (uniqueWords.length === 0) {
        setIsGeneratingDictionary(false);
        return;
      }

      // 2. Batch translate words (e.g., 100 words per batch)
      const batchSize = 100;
      const totalWords = uniqueWords.length;
      let currentWordMap = { ...(book.subtitles?.[targetSubtitleLanguage]?.wordTranslations || {}) };
      let latestBook = book;
      let wordsSinceLastSave = 0;

      console.log(`[Dictionary] Starting translation batches. Current dictionary size: ${Object.keys(currentWordMap).length}`);

      for (let i = 0; i < uniqueWords.length; i += batchSize) {
        if (cancelRef.current) {
          console.log(`[Dictionary] Generation cancelled by user.`);
          break;
        }

        const batch = uniqueWords.slice(i, i + batchSize);
        // Skip words already in dictionary
        const wordsToTranslate = batch.filter(w => !currentWordMap[w.toLowerCase()]);
        
        if (wordsToTranslate.length > 0) {
          console.log(`[Dictionary] Translating batch ${Math.floor(i/batchSize) + 1}. Words to translate: ${wordsToTranslate.length}`);
          const translatedBatch = await translateWordsBatch(wordsToTranslate, targetSubtitleLanguage, apiKey);
          
          if (translatedBatch) {
            const newWordsCount = Object.keys(translatedBatch).length;
            console.log(`[Dictionary] Received ${newWordsCount} translations.`);
            Object.entries(translatedBatch).forEach(([word, trans]) => {
              currentWordMap[word.toLowerCase()] = trans as string;
            });
            wordsSinceLastSave += wordsToTranslate.length;
          } else {
            console.warn(`[Dictionary] Batch ${Math.floor(i/batchSize) + 1} returned no results.`);
          }
        } else {
          console.log(`[Dictionary] Skipping batch ${Math.floor(i/batchSize) + 1} (all words already translated).`);
        }

        const progress = Math.round(((i + batchSize) / totalWords) * 100);
        setDictionaryProgress(Math.min(100, progress));

        // Save incrementally every 1000 new words or at the end
        if (wordsSinceLastSave >= 1000 || i + batchSize >= totalWords) {
          console.log(`[Dictionary] Saving progress to database... (${Object.keys(currentWordMap).length} words total)`);
          const updatedSubtitles = {
            ...(latestBook.subtitles || {}),
            [targetSubtitleLanguage]: {
              ...(latestBook.subtitles?.[targetSubtitleLanguage] || { pages: {}, lastUpdated: Date.now() }),
              wordTranslations: currentWordMap,
              lastUpdated: Date.now()
            }
          };
          const updatedBook = { ...latestBook, subtitles: updatedSubtitles };
          latestBook = updatedBook;
          setBook(updatedBook);
          updateBook(book.id, { subtitles: updatedSubtitles });
          await db.updateBookField(book.id, 'subtitles', updatedSubtitles);
          wordsSinceLastSave = 0;
        }

        // Small delay to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (err: any) {
      console.error("Dictionary generation failed", err);
      const errorStr = (err?.message || JSON.stringify(err)).toLowerCase();
      if (errorStr.includes('429') || errorStr.includes('resource_exhausted') || errorStr.includes('quota') || errorStr.includes('limit')) {
        setErrorMessage("Gemini API quota exceeded. Progress has been saved. You can resume later.");
      } else {
        setErrorMessage("Failed to generate word dictionary. Progress has been saved.");
      }
    } finally {
      setIsGeneratingDictionary(false);
      setCancelDictionary(false);
    }
  };

  const handleDeleteSubtitles = async (lang: string) => {
    if (!book) return;
    const updatedSubtitles = { ...(book.subtitles || {}) };
    delete updatedSubtitles[lang];
    const updatedBook = { ...book, subtitles: updatedSubtitles };
    setBook(updatedBook);
    updateBook(book.id, { subtitles: updatedSubtitles });
    await db.saveBook(updatedBook);
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
        keriKetivEnabled,
        isDramatizedReadingEnabled,
        ttsProvider,
        aiChunkSizeMultiplier,
        geminiVoice,
        subtitleLanguage: targetSubtitleLanguage,
        isSubtitleTranslationEnabled,
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
        keriKetivEnabled,
        isDramatizedReadingEnabled,
        ttsProvider,
        aiChunkSizeMultiplier,
        geminiVoice,
        subtitleLanguage: targetSubtitleLanguage,
        isSubtitleTranslationEnabled,
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
    
    const BATCH_SIZE = aiChunkSizeMultiplier;
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

        let result = null;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            result = await analyzeSpeakersBatch(batchPages, apiKey, currentSpeakerVoices, bookLanguage);
            break;
          } catch (batchErr) {
            retryCount++;
            if (retryCount > maxRetries) throw batchErr;
            console.warn(`Batch failed, retrying (${retryCount}/${maxRetries})...`, batchErr);
            await new Promise(resolve => setTimeout(resolve, 3000 * retryCount));
          }
        }
        
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
    setIsPreviewingVoice(voiceName);
    try {
      const isHebrew = bookLanguage.toLowerCase() === 'hebrew';
      const text = isHebrew 
        ? `שלום, אני ${voiceName}. ככה אני נשמע בקריאה של הספר.`
        : `Hello, I am ${voiceName}. This is how I sound in the reading of the book.`;

      if (ttsProvider === 'browser') {
        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = availableBrowserVoices.find(v => v.name === voiceName);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.onend = () => setIsPreviewingVoice(null);
        utterance.onerror = () => setIsPreviewingVoice(null);
        window.speechSynthesis.speak(utterance);
        return;
      }

      if (!apiKey) {
        setIsPreviewingVoice(null);
        return;
      }

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
                if (e.target.value === 'Hebrew' || e.target.value === 'Arabic') {
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
              <option value="Russian">Russian</option>
              <option value="Arabic">Arabic</option>
              <option value="Italian">Italian</option>
              <option value="Portuguese">Portuguese</option>
              <option value="Japanese">Japanese</option>
              <option value="Chinese">Chinese</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {bookLanguage === 'Hebrew' && (
            <div className="flex items-center gap-2 mr-4">
              <input 
                type="checkbox" 
                id="keriKetiv" 
                checked={keriKetivEnabled} 
                onChange={(e) => setKeriKetivEnabled(e.target.checked)}
                className="w-4 h-4 text-purple-600 border-zinc-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="keriKetiv" className="text-sm text-zinc-600 cursor-pointer">Keri/Ketiv Correction</label>
            </div>
          )}
          <Button variant="outline" onClick={() => navigate('/')} className="flex-1 sm:flex-none justify-center">
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
          <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                Dramatized Reading (AI)
              </span>
              <span className="text-xs text-zinc-500 font-light">Use unique voices for characters and narrators.</span>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setShowDramatizeConfirm(true);
                  if (!isDramatizedReadingEnabled) setIsDramatizedReadingEnabled(true);
                }} 
                disabled={isDramatizingFullBook || isSaving}
                className={cn(
                  "border-purple-200 text-purple-700 hover:bg-purple-50 min-w-[160px] h-10 rounded-xl font-semibold",
                  isDramatizingFullBook && "animate-pulse"
                )}
              >
                {isDramatizingFullBook ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {dramatizationProgress}%
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} />
                    {existingProgress > 0 && existingProgress < 100 
                      ? `Continue (${existingProgress}%)` 
                      : (existingProgress === 100 || (book.dramatization?.pages && Object.keys(book.dramatization.pages).length === pages.length))
                        ? 'Redo Analysis'
                        : 'Dramatize Book'}
                  </span>
                )}
              </Button>

              <div className="h-8 w-px bg-zinc-200 hidden sm:block mx-1" />

              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-bold uppercase tracking-wider", isDramatizedReadingEnabled ? "text-purple-600" : "text-zinc-400")}>
                  {isDramatizedReadingEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={isDramatizedReadingEnabled}
                    onChange={(e) => setIsDramatizedReadingEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" /> Advanced & AI Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                TTS Provider
              </label>
              <select
                value={ttsProvider}
                onChange={(e) => setTtsProvider(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="browser">Browser Native</option>
                <option value="gemini">Gemini API (High Quality)</option>
              </select>
              <p className="text-[10px] text-zinc-500 mt-1">
                Choose how this book should be read. Gemini API provides much better quality but uses API calls.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                AI Context Size (Save API Calls)
              </label>
              <select
                value={aiChunkSizeMultiplier}
                onChange={(e) => setAiChunkSizeMultiplier(parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="1">1x (Faster - 1 page per call)</option>
                <option value="2">2x (Longer - 2 pages per call)</option>
                <option value="3">3x (Max - 3 pages per call)</option>
              </select>
              <p className="text-[10px] text-zinc-500 mt-1">
                Send more text to Gemini at once to reduce the number of API calls for this specific book.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <User size={16} className="text-purple-600" /> {isDramatizedReadingEnabled ? 'Character Voices (AI Managed)' : 'Book Voice'}
          </h2>
          
          {isDramatizedReadingEnabled ? (
            <div className="p-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200 flex flex-col items-center text-center">
              <div className="bg-purple-100 text-purple-600 p-3 rounded-full mb-3">
                <Sparkles size={24} />
              </div>
              <p className="text-sm font-medium text-zinc-900">AI Dramatization is Active</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                Character voices are automatically identified and assigned by AI. There is no need to manually define them here.
              </p>
              {Object.keys(speakerVoices).length > 1 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {Object.keys(speakerVoices).filter(s => s !== 'Narrator').slice(0, 5).map(s => (
                    <span key={s} className="px-2 py-1 bg-white border border-zinc-200 rounded-md text-[10px] text-zinc-600 font-medium">
                      {s}
                    </span>
                  ))}
                  {Object.keys(speakerVoices).length > 6 && (
                    <span className="px-2 py-1 bg-white border border-zinc-200 rounded-md text-[10px] text-zinc-400">
                      +{Object.keys(speakerVoices).length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-xs">
              <label className="text-xs font-medium text-zinc-700 mb-1.5 block">Select Voice for this Book</label>
              <div className="flex items-center gap-3">
                <select
                  value={speakerVoices['Narrator'] || (ttsProvider === 'gemini' ? 'Zephyr' : '')}
                  onChange={(e) => handleVoiceChange('Narrator', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  {ttsProvider === 'gemini' ? (
                    getAvailableVoices(bookLanguage.toLowerCase() === 'hebrew').map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.description})</option>
                    ))
                  ) : (
                    <>
                      <option value="">Default Browser Voice</option>
                      {availableBrowserVoices
                        .filter(v => bookLanguage.toLowerCase() === 'hebrew' ? v.lang.startsWith('he') : true)
                        .map(v => (
                          <option key={v.name} value={v.name}>{v.name}</option>
                        ))
                      }
                    </>
                  )}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => previewVoice(speakerVoices['Narrator'] || 'Zephyr')}
                  disabled={isPreviewingVoice === (speakerVoices['Narrator'] || 'Zephyr')}
                  className="h-9 w-9 p-0 rounded-lg bg-white shadow-sm border border-zinc-100 hover:bg-purple-50 hover:text-purple-600 transition-all"
                >
                  {isPreviewingVoice === (speakerVoices['Narrator'] || 'Zephyr') ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Volume2 size={14} />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <Captions size={16} className="text-blue-600" /> Subtitles & Translation
          </h2>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-zinc-700">Target Language</label>
              <select
                value={targetSubtitleLanguage}
                onChange={(e) => setTargetSubtitleLanguage(e.target.value)}
                className="px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white w-full"
              >
                <option value="Hebrew">Hebrew</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Russian">Russian</option>
                <option value="Arabic">Arabic</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Japanese">Japanese</option>
                <option value="Chinese">Chinese</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-zinc-700">Enable Subtitles</label>
              <div className="flex items-center h-[38px]">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={isSubtitleTranslationEnabled}
                    onChange={(e) => setIsSubtitleTranslationEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-5">
              <Button 
                onClick={() => handleGenerateSubtitles(false)} 
                disabled={isGeneratingSubtitles || isGeneratingDictionary || isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white border-transparent"
              >
                {isGeneratingSubtitles ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> Subtitles ({subtitleProgress}%)</>
                ) : (
                  <><Sparkles size={16} className="mr-2" /> {book.subtitles?.[targetSubtitleLanguage]?.pages && Object.keys(book.subtitles[targetSubtitleLanguage].pages).length > 0 ? 'Continue Subtitles' : 'Generate Subtitles'}</>
                )}
              </Button>
              <Button 
                onClick={handleGenerateDictionary} 
                disabled={isGeneratingSubtitles || isGeneratingDictionary || isSaving}
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {isGeneratingDictionary ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> Dictionary ({dictionaryProgress}%)</>
                ) : (
                  <><Sparkles size={16} className="mr-2" /> {book.subtitles?.[targetSubtitleLanguage]?.wordTranslations ? 'Update Dictionary' : 'Generate Dictionary'}</>
                )}
              </Button>
            </div>
          </div>
          {book.subtitles?.[targetSubtitleLanguage] && (
            <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-blue-700">
                  <Check size={14} className="text-emerald-500" />
                  <span className="text-xs font-medium">
                    Subtitles: {Object.keys(book.subtitles[targetSubtitleLanguage].pages || {}).length} pages ready
                  </span>
                </div>
                <div className="flex items-center gap-2 text-blue-700">
                  <Check size={14} className="text-emerald-500" />
                  <span className="text-xs font-medium">
                    Dictionary: {Object.keys(book.subtitles[targetSubtitleLanguage].wordTranslations || {}).length} words ready
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-blue-100 pt-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleDeleteSubtitles(targetSubtitleLanguage)}
                  className="h-7 px-2 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Delete All Data
                </Button>
                <span className="text-[10px] text-blue-400">
                  Last updated: {new Date(book.subtitles[targetSubtitleLanguage].lastUpdated).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
          <p className="text-[10px] text-zinc-500 mt-3 italic">
            Generating subtitles saves them to the database so they don't need to be translated on-the-fly while reading.
          </p>
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
                  <span>{dramatizationProgress === 100 ? <Check size={18} className="text-emerald-500" /> : `${dramatizationProgress}%`}</span>
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

          {isGeneratingSubtitles && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
                <div className="bg-blue-100 text-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-bounce">
                  <Captions size={32} />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 mb-2">Generating Subtitles</h3>
                <p className="text-zinc-500 mb-8">
                  {isWaitingForQuota ? (
                    <span className="text-amber-600 font-medium flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Gemini API quota reached. Waiting to resume...
                    </span>
                  ) : (
                    `AI is translating the book to ${targetSubtitleLanguage}. This will allow you to read with translations without waiting for API calls.`
                  )}
                </p>
                
                <div className="w-full bg-zinc-100 h-3 rounded-full overflow-hidden mb-4">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${subtitleProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm font-medium text-zinc-600 mb-8">
                  <span>Progress</span>
                  <span>{subtitleProgress === 100 ? <Check size={18} className="text-emerald-500" /> : `${subtitleProgress}%`}</span>
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => {
                    cancelRef.current = true;
                    setCancelSubtitles(true);
                  }}
                  disabled={cancelSubtitles}
                  className="w-full py-6 rounded-2xl border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                >
                  {cancelSubtitles ? 'Cancelling...' : 'Cancel Generation'}
                </Button>
              </div>
            </div>
          )}

          {isGeneratingDictionary && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
                <div className="bg-emerald-100 text-emerald-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-bounce">
                  <Sparkles size={32} />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 mb-2">Generating Dictionary</h3>
                <p className="text-zinc-500 mb-8">
                  {isWaitingForQuota ? (
                    <span className="text-amber-600 font-medium flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Gemini API quota reached. Waiting to resume...
                    </span>
                  ) : (
                    `AI is creating a full word dictionary for the book in ${targetSubtitleLanguage}. This makes tap-to-translate instant.`
                  )}
                </p>
                
                <div className="w-full bg-zinc-100 h-3 rounded-full overflow-hidden mb-4">
                  <div 
                    className="bg-emerald-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${dictionaryProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm font-medium text-zinc-600 mb-8">
                  <span>Progress</span>
                  <span>{dictionaryProgress === 100 ? <Check size={18} className="text-emerald-500" /> : `${dictionaryProgress}%`}</span>
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => {
                    cancelRef.current = true;
                    setCancelDictionary(true);
                  }}
                  disabled={cancelDictionary}
                  className="w-full py-6 rounded-2xl border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                >
                  {cancelDictionary ? 'Cancelling...' : 'Cancel Generation'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
