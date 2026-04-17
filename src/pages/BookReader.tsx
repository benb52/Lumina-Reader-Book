import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Settings as SettingsIcon, X, BookOpen, Languages, Search, ChevronLeft, ChevronRight, MessageSquare, Zap, Highlighter, Captions, Sparkles, Moon, Sun, Loader2, MoreVertical, Check, Volume2 } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';
import QuotesPanel from '../components/QuotesPanel';
import XRayPanel from '../components/XRayPanel';
import { getDefinition, translateText, generateSpeech, translateSentencesBatch, analyzeBookWithAI, analyzeSpeakers, analyzeSpeakersBatch, generateMultiSpeakerSpeech, translateWordInContext } from '../services/ai';
import { applyKeriKetiv } from '../lib/hebrewUtils';
import { cn, getCleanText, getSentences } from '../lib/utils';

// Helper to convert raw PCM base64 to WAV base64 so the browser can play it
const pcmBase64ToWavBase64 = (base64Pcm: string, sampleRate: number = 24000): string => {
  const binaryString = atob(base64Pcm);
  const pcmData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmData[i] = binaryString.charCodeAt(i);
  }

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true);

  const wavBytes = new Uint8Array(44 + pcmData.length);
  wavBytes.set(new Uint8Array(wavHeader), 0);
  wavBytes.set(pcmData, 44);

  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

interface TtsChunk {
  text: string;
  sentences: string[];
  startIndex: number;
}

const buildTtsChunks = (sentences: string[]): TtsChunk[] => {
  const chunks: TtsChunk[] = [];
  let currentText = '';
  let currentSentences: string[] = [];
  let startIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    currentText += sentence;
    currentSentences.push(sentence);

    // Group sentences into chunks of ~400 characters, or break at paragraph boundaries
    if (currentText.length > 400 || i === sentences.length - 1 || sentence.includes('\n')) {
      chunks.push({
        text: currentText,
        sentences: [...currentSentences],
        startIndex: startIndex
      });
      currentText = '';
      currentSentences = [];
      startIndex = i + 1;
    }
  }
  return chunks;
};

export default function BookReader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [showXRay, setShowXRay] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isAnalyzingSummary, setIsAnalyzingSummary] = useState(false);
  const [isDramatizing, setIsDramatizing] = useState(false);
  const [isTranslationModeActive, setIsTranslationModeActive] = useState(false);
  const [isDramatizingFullBook, setIsDramatizingFullBook] = useState(false);
  const [dramatizationProgress, setDramatizationProgress] = useState(0);
  const [showDramatizeConfirm, setShowDramatizeConfirm] = useState(false);
  const [cancelDramatization, setCancelDramatization] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [audioQueue, setAudioQueue] = useState<{ url: string, timings: { start: number, end: number, segmentIdx: number }[] }[]>([]);
  const audioQueueRef = useRef<{ url: string, timings: { start: number, end: number, segmentIdx: number }[] }[]>([]);
  const isPlayingQueueRef = useRef(false);
  const cancelRef = useRef(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [highlightRange, setHighlightRange] = useState<{ start: number, end: number } | null>(null);
  const highlightRangeRef = useRef<{ start: number, end: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [selectedText, setSelectedText] = useState('');
  const [aiResult, setAiResult] = useState<{ type: 'def' | 'trans' | null, content: string }>({ type: null, content: '' });
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [pageTranslations, setPageTranslations] = useState<string[]>([]);
  const [isTranslatingSubtitle, setIsTranslatingSubtitle] = useState(false);
  const [batchTranslationStatus, setBatchTranslationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number | null>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [geminiAudioData, setGeminiAudioData] = useState<{ url: string, sentences: string[] } | null>(null);
  const [isTurningPage, setIsTurningPage] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const pageStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const isWaitingForQuota = useStore((state) => state.isWaitingForQuota);
  const settings = useStore((state) => state.settings);
  const updateBook = useStore((state) => state.updateBook);
  const updateSettings = useStore((state) => state.updateSettings);
  const addReadingSession = useStore((state) => state.addReadingSession);
  const apiCallCount = useStore((state) => state.apiCallCount);
  const apiKey = settings.apiKey;

  const effectiveSubtitleLanguage = book?.subtitleLanguage || settings.subtitleLanguage || 'Hebrew';
  const effectiveIsSubtitleTranslationEnabled = book?.isSubtitleTranslationEnabled ?? settings.isSubtitleTranslationEnabled ?? false;
  const effectiveGeminiVoice = book?.geminiVoice || settings.geminiVoice || 'Kore';

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isGeneratingChunksRef = useRef(false);

  // Refs to fix closure issues in async recursive functions
  const settingsRef = useRef(settings);
  const isSubtitleTranslationEnabledRef = useRef(effectiveIsSubtitleTranslationEnabled);
  const apiKeyRef = useRef(apiKey);
  const isPlayingRef = useRef(isPlaying);
  const currentPageRef = useRef(currentPage);
  const pagesRef = useRef(pages);
  const bookRef = useRef(book);
  const isTurningPageRef = useRef(isTurningPage);
  const currentSentenceIndexRef = useRef(currentSentenceIndex);
  const currentSegmentIndexRef = useRef(currentSegmentIndex);

  useEffect(() => {
    settingsRef.current = settings;
    isSubtitleTranslationEnabledRef.current = effectiveIsSubtitleTranslationEnabled;
    apiKeyRef.current = apiKey;
    isPlayingRef.current = isPlaying;
    currentPageRef.current = currentPage;
    pagesRef.current = pages;
    bookRef.current = book;
    isTurningPageRef.current = isTurningPage;
    currentSentenceIndexRef.current = currentSentenceIndex;
    currentSegmentIndexRef.current = currentSegmentIndex;
  }, [settings, apiKey, isPlaying, currentPage, pages, isTurningPage, currentSentenceIndex, currentSegmentIndex]);

  const [isTtsSlow, setIsTtsSlow] = useState(false);

  useEffect(() => {
    let timeout: any;
    if (isTtsLoading) {
      timeout = setTimeout(() => {
        setIsTtsSlow(true);
      }, 10000);
    } else {
      setIsTtsSlow(false);
    }
    return () => clearTimeout(timeout);
  }, [isTtsLoading]);

  useEffect(() => {
    let timeout: any;
    if (isTurningPage) {
      timeout = setTimeout(() => {
        console.warn("[Reader] Page turn stuck? Auto-resetting...");
        setIsTurningPage(false);
      }, 15000);
    }
    return () => clearTimeout(timeout);
  }, [isTurningPage]);

  useEffect(() => {
    let timeout: any;
    if (isTtsLoading) {
      timeout = setTimeout(() => {
        console.warn("[TTS] TTS loading stuck? Auto-resetting...");
        setIsTtsLoading(false);
      }, 120000); // Increased to 120s to allow for multiple retries
    }
    return () => clearTimeout(timeout);
  }, [isTtsLoading]);

  useEffect(() => {
    let timeout: any;
    if (isDramatizing) {
      timeout = setTimeout(() => {
        console.warn("[Reader] Dramatization stuck? Auto-resetting...");
        setIsDramatizing(false);
      }, 180000); // Increased to 180s
    }
    return () => clearTimeout(timeout);
  }, [isDramatizing]);

  // Background pre-dramatization for next page
  useEffect(() => {
    if (!book || !apiKey || !book.isDramatizedReadingEnabled || isDramatizing || isDramatizingFullBook) return;
    
    const nextPage = currentPage + 1;
    if (nextPage < pages.length && (!book.dramatization?.pages || !book.dramatization.pages[nextPage])) {
      // Only pre-dramatize if we are playing or if the user is near the end of the current page
      const currentSentences = getSentences(getCleanText(pages[currentPage]));
      const shouldPreDramatize = isPlaying || (currentSentenceIndex !== null && currentSentenceIndex > currentSentences.length * 0.7);
      
      if (shouldPreDramatize) {
        console.log(`[Reader] Pre-dramatizing next page (${nextPage}) in background...`);
        const cleanText = getCleanText(pages[nextPage]);
        const existingVoices = book.dramatization?.speakerVoices || {};
        const existingGenders = book.dramatization?.speakerGenders || {};
        
        analyzeSpeakers(cleanText, apiKey, existingVoices, book.language || 'English', () => isPlayingRef.current)
          .then(result => {
            if (result && result.segments) {
              const newSpeakerVoices = { ...existingVoices, ...(result.newSpeakerVoices || {}) };
              const newSpeakerGenders = { ...existingGenders, ...(result.speakerGenders || {}) };
              
              const segmentsWithVoices = result.segments.map((s: any) => ({
                ...s,
                voice: newSpeakerVoices[s.speaker] || (newSpeakerGenders[s.speaker] === 'female' ? 'Zephyr' : newSpeakerGenders[s.speaker] === 'male' ? 'Charon' : 'Puck')
              }));

              const updatedDramatization = {
                pages: {
                  ...(book.dramatization?.pages || {}),
                  [nextPage]: { segments: segmentsWithVoices }
                },
                speakerVoices: newSpeakerVoices,
                speakerGenders: newSpeakerGenders
              };

              const updatedBook = { ...book, dramatization: updatedDramatization };
              setBook(updatedBook);
              db.saveBook(updatedBook);
              updateBook(book.id, { dramatization: updatedDramatization });
              console.log(`[Reader] Background dramatization for page ${nextPage} complete.`);
            }
          })
          .catch(err => console.warn(`[Reader] Background dramatization for page ${nextPage} failed:`, err));
      }
    }
  }, [currentPage, isPlaying, currentSentenceIndex, book?.dramatization, book?.isDramatizedReadingEnabled, apiKey]);

  useEffect(() => {
    if (id) {
      loadBook(id);
    }
    synthRef.current = window.speechSynthesis;
    const audio = new Audio();
    audioRef.current = audio;
    
    const handleEnded = () => {
      console.log("[TTS] Audio ended");
      if (audioQueueRef.current.length > 0) {
        const next = audioQueueRef.current.shift()!;
        audio.src = next.url;
        audio.playbackRate = settingsRef.current.ttsSpeed;
        
        audio.onplay = () => {
          const updateDramatizedHighlight = () => {
            if (!isPlayingRef.current || !audioRef.current) return;
            const currentTime = audioRef.current.currentTime;
            
            if (next.timings && next.timings.length > 0) {
              const activeTiming = next.timings.find(t => currentTime >= t.start && currentTime <= t.end);
              if (activeTiming && currentSegmentIndexRef.current !== activeTiming.segmentIdx) {
                setCurrentSegmentIndex(activeTiming.segmentIdx);
                currentSegmentIndexRef.current = activeTiming.segmentIdx;
              }
            } else if (next.sentenceRanges && next.sentenceRanges.length > 0) {
              // Non-dramatized Gemini TTS highlight
              const duration = audioRef.current.duration;
              if (duration && !isNaN(duration) && duration !== Infinity) {
                const progress = Math.min(0.999, currentTime / duration);
                const targetChar = progress * (next.textLength || 0);
                let activeLocalIdx = next.sentenceRanges.findIndex(r => targetChar >= r.start && targetChar <= r.end);
                if (activeLocalIdx !== -1) {
                  const activeGlobalIdx = (next.startIndex || 0) + activeLocalIdx;
                  if (currentSentenceIndexRef.current !== activeGlobalIdx) {
                    setCurrentSentenceIndex(activeGlobalIdx);
                    currentSentenceIndexRef.current = activeGlobalIdx;
                  }
                }
              }
            }
            animationFrameRef.current = requestAnimationFrame(updateDramatizedHighlight);
          };
          animationFrameRef.current = requestAnimationFrame(updateDramatizedHighlight);
        };

        audio.play().catch(e => console.error("Queue play failed", e));
      } else if (isGeneratingChunksRef.current) {
        console.log("[TTS] Queue empty but still generating chunks...");
        isPlayingQueueRef.current = false;
      } else {
        isPlayingQueueRef.current = false;
        if (!isPlayingRef.current) return;
        handleEndOfPage();
      }
    };
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      if (synthRef.current) synthRef.current.cancel();
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.removeEventListener('ended', handleEnded);
      }
      setIsPlaying(false);
      setIsTtsLoading(false);
      isPlayingRef.current = false;
      setCurrentSubtitle('');
      setCurrentSentenceIndex(null);
      setCurrentSegmentIndex(null);
    };
  }, [id]);

  // Auto-scroll to highlighted sentence or segment
  useEffect(() => {
    if ((currentSentenceIndex !== null || currentSegmentIndex !== null) && contentRef.current) {
      // Find the highlighted element. We use a more robust selector.
      const highlightedElement = contentRef.current.querySelector('[data-highlighted="true"]');
      if (highlightedElement) {
        // Calculate scroll position relative to the container
        const container = contentRef.current;
        const elementRect = highlightedElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Check if element is outside the visible area of the container
        if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
          // Scroll container so element is near the top/center
          container.scrollTo({
            top: container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 3),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [currentSentenceIndex, currentSegmentIndex, isPlaying]);

  // Sync highlight range when segment or sentence changes
  useEffect(() => {
    if (!pages[currentPage]) {
      setHighlightRange(null);
      return;
    }
    
    const cleanText = getCleanText(pages[currentPage]);

    if (currentSegmentIndex !== null && book?.dramatization?.pages[currentPage]) {
      const segments = book.dramatization.pages[currentPage].segments;
      const currentSegment = segments[currentSegmentIndex];
      if (currentSegment) {
        let searchIdx = 0;
        for (let i = 0; i < currentSegmentIndex; i++) {
          const prevSegment = segments[i];
          const idx = cleanText.indexOf(prevSegment.text, searchIdx);
          if (idx !== -1) {
            searchIdx = idx + prevSegment.text.length;
          }
        }
        const start = cleanText.indexOf(currentSegment.text, searchIdx);
        if (start !== -1) {
          setHighlightRange({ start, end: start + currentSegment.text.length });
        }
      }
    } else if (currentSentenceIndex !== null) {
      const sentences = getSentences(cleanText);
      const currentSentence = sentences[currentSentenceIndex];
      if (currentSentence) {
        let searchIdx = 0;
        for (let i = 0; i < currentSentenceIndex; i++) {
          const prevSentence = sentences[i];
          const idx = cleanText.indexOf(prevSentence, searchIdx);
          if (idx !== -1) {
            searchIdx = idx + prevSentence.length;
          }
        }
        const start = cleanText.indexOf(currentSentence, searchIdx);
        if (start !== -1) {
          setHighlightRange({ start, end: start + currentSentence.length });
        }
      }
    } else {
      setHighlightRange(null);
    }
  }, [currentSentenceIndex, currentSegmentIndex, currentPage, pages, book]);

  const loadBook = async (bookId: string) => {
    const b = await db.getBook(bookId);
    if (b) {
      setBook(b);
      // Split content by our marker
      const pgs = b.content.split('<<LUMINA_PAGE_BREAK>>').filter(p => p.trim() !== '');
      setPages(pgs);
      setCurrentPage(Math.max(0, b.lastReadPage - 1));
      if (b.lastReadSentenceIndex !== undefined) {
        setCurrentSentenceIndex(b.lastReadSentenceIndex);
      }
      
      // Load quotes
      const savedQuotes = await db.getQuotes(bookId);
      if (savedQuotes) setQuotes(savedQuotes);
    } else {
      navigate('/');
    }
  };

  const saveProgress = async (pageIndex: number, sentenceIndex?: number | null) => {
    if (book) {
      const updatedBook = { 
        ...book, 
        lastReadPage: pageIndex + 1,
        lastReadSentenceIndex: sentenceIndex !== undefined ? sentenceIndex : (isPlaying ? currentSentenceIndex : null)
      };
      await db.saveBook(updatedBook);
      updateBook(book.id, { 
        lastReadPage: pageIndex + 1,
        lastReadSentenceIndex: sentenceIndex !== undefined ? sentenceIndex : (isPlaying ? currentSentenceIndex : null)
      });
      
      // Record reading session
      const durationSeconds = Math.round((Date.now() - pageStartTimeRef.current) / 1000);
      if (durationSeconds > 5) { // Only record if they spent at least 5 seconds on the page
        addReadingSession({
          id: crypto.randomUUID(),
          bookId: book.id,
          date: Date.now(),
          pagesRead: 1,
          durationSeconds: Math.min(durationSeconds, 3600), // Cap at 1 hour per page
          language: book.language || 'Unknown'
        });
      }
      pageStartTimeRef.current = Date.now();
    }
  };

  const handleAnalyzeSummary = async () => {
    if (showSummary) {
      setShowSummary(false);
      return;
    }
    
    setShowSummary(true);
    setShowXRay(false);
    setShowQuotes(false);
    
    if (book?.analysis?.summary) {
      setSummaryText(book.analysis.summary);
      return;
    }

    if (!summaryText) {
      if (!apiKey) {
        setErrorMessage('API Key is required for AI analysis.');
        return;
      }
      setIsAnalyzingSummary(true);
      try {
        const effectiveAiChunkSizeMultiplier = book?.aiChunkSizeMultiplier || settings.aiChunkSizeMultiplier || 1;
        const result = await analyzeBookWithAI(book!.content, apiKey, settings.aiLanguage, effectiveAiChunkSizeMultiplier);
        if (result && result.summary) {
          setSummaryText(result.summary);
          const updatedBook = { ...book!, analysis: result };
          await db.saveBook(updatedBook);
          updateBook(book!.id, { analysis: result });
          setBook(updatedBook);
        } else {
          setErrorMessage('Failed to generate summary.');
        }
      } catch (err) {
        console.error(err);
        setErrorMessage('Error analyzing book.');
      } finally {
        setIsAnalyzingSummary(false);
      }
    }
  };

  const handleDramatizePage = async () => {
    if (!book || !apiKey) return null;
    setIsDramatizing(true);
    try {
      const current = currentPageRef.current;
      const cleanText = getCleanText(pagesRef.current[current]);

      const existingVoices = book.dramatization?.speakerVoices || {};
      const existingGenders = book.dramatization?.speakerGenders || {};
      const result = await analyzeSpeakers(
        cleanText, 
        apiKey, 
        existingVoices, 
        book.language || 'English',
        () => isPlayingRef.current
      );
      
      if (result && result.segments) {
        const newSpeakerVoices = { ...existingVoices, ...(result.newSpeakerVoices || {}) };
        const newSpeakerGenders = { ...existingGenders, ...(result.speakerGenders || {}) };
        
        // Fallback voice assignment if AI missed some
        const availableVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr', 'Aoede'];
        const segmentsWithVoices = result.segments.map((s: any) => {
          let voice = newSpeakerVoices[s.speaker];
          
          if (!voice) {
            // Suggest based on gender
            const gender = newSpeakerGenders[s.speaker] || 'neutral';
            if (gender === 'female') voice = 'Zephyr';
            else if (gender === 'male') voice = 'Charon';
            else voice = 'Puck';
            
            newSpeakerVoices[s.speaker] = voice;
          }
          
          return {
            ...s,
            voice
          };
        });

        const updatedDramatization = {
          pages: {
            ...(book.dramatization?.pages || {}),
            [currentPage]: { segments: segmentsWithVoices }
          },
          speakerVoices: newSpeakerVoices,
          speakerGenders: newSpeakerGenders
        };

        const updatedBook = { ...book, dramatization: updatedDramatization };
        setBook(updatedBook);
        await db.saveBook(updatedBook);
        updateBook(book.id, { dramatization: updatedDramatization });
        return updatedBook;
      }
    } catch (err) {
      console.error("Dramatization failed", err);
      setErrorMessage("Failed to dramatize page.");
    } finally {
      setIsDramatizing(false);
    }
    return null;
  };

  const handleDramatizeFullBook = async (startFresh: boolean = false) => {
    if (!book || !apiKey || pages.length === 0) {
      if (!apiKey) setErrorMessage('API Key is required for AI analysis.');
      return;
    }
    
    setShowDramatizeConfirm(false);
    setIsDramatizingFullBook(true);
    setDramatizationProgress(0);
    setCancelDramatization(false);
    cancelRef.current = false;
    
    let currentSpeakerVoices = startFresh ? { Narrator: 'Zephyr' } : { Narrator: 'Zephyr', ...(book.dramatization?.speakerVoices || {}) };
    let currentSpeakerGenders = startFresh ? { Narrator: 'female' } : { Narrator: 'female', ...(book.dramatization?.speakerGenders || {}) };
    let currentPagesDramatization = startFresh ? {} : { ...(book.dramatization?.pages || {}) };
    let latestBook = book;
    
    const BATCH_SIZE = 1;

    try {
      // Find all pages that need dramatization
      const pagesToDramatize = pages.map((p, i) => ({ index: i, text: p }))
        .filter(p => startFresh || !currentPagesDramatization[p.index]);
      
      const totalToDramatize = pagesToDramatize.length;
      let completedInThisSession = 0;

      for (let i = 0; i < pagesToDramatize.length; i += BATCH_SIZE) {
        if (cancelRef.current) break;

        const batchPages: { index: number, text: string }[] = [];
        
        // Determine how many pages to take for this batch
        // If we are near the end (e.g. only 1 or 2 pages left beyond this batch), merge them
        let currentBatchEnd = i + BATCH_SIZE;
        const remainingAfterThisBatch = pagesToDramatize.length - currentBatchEnd;
        
        // If 2 or fewer pages are left after this batch, merge them into this batch
        if (remainingAfterThisBatch > 0 && remainingAfterThisBatch <= 2) {
          currentBatchEnd = pagesToDramatize.length;
        }

        for (let j = i; j < currentBatchEnd; j++) {
          const page = pagesToDramatize[j];
          const cleanText = getCleanText(page.text);
          if (cleanText.trim()) {
            batchPages.push({ index: page.index, text: cleanText });
          } else {
            // Empty page, mark as narrator
            currentPagesDramatization[page.index] = { segments: [{ text: page.text, speaker: 'Narrator', voice: currentSpeakerVoices['Narrator'] || 'Zephyr' }] };
          }
        }

        if (batchPages.length === 0) {
          completedInThisSession += (currentBatchEnd - i);
          setDramatizationProgress(Math.min(100, Math.round((completedInThisSession / totalToDramatize) * 100)));
          i = currentBatchEnd - BATCH_SIZE; // Adjust loop index
          continue;
        }

        // Add a delay between requests to proactively avoid rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        let result = null;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            result = await analyzeSpeakersBatch(batchPages, apiKey, currentSpeakerVoices, book.language || 'English');
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

          result.pages.forEach((pageData: any) => {
            let voice = newSpeakerVoices[pageData.speaker] || 'Kore';
            
            const segmentsWithVoices = pageData.segments.map((s: any) => {
              let sVoice = newSpeakerVoices[s.speaker];
              if (!sVoice) {
                const gender = newSpeakerGenders[s.speaker] || 'neutral';
                if (gender === 'female') sVoice = 'Zephyr';
                else if (gender === 'male') sVoice = 'Charon';
                else sVoice = 'Puck';
                newSpeakerVoices[s.speaker] = sVoice;
              }
              return {
                ...s,
                voice: sVoice
              };
            });
            currentPagesDramatization[pageData.pageIndex] = { segments: segmentsWithVoices };
          });

          // Save incrementally after EVERY batch
          const updatedDramatization = {
            pages: currentPagesDramatization,
            speakerVoices: currentSpeakerVoices,
            speakerGenders: currentSpeakerGenders
          };
          const updatedBook = { ...latestBook, dramatization: updatedDramatization };
          latestBook = updatedBook;
          setBook(updatedBook);
          await db.saveBook(updatedBook);
          updateBook(book.id, { dramatization: updatedDramatization });
        }
        
        completedInThisSession += (currentBatchEnd - i);
        setDramatizationProgress(Math.min(100, Math.round((completedInThisSession / totalToDramatize) * 100)));
        i = currentBatchEnd - BATCH_SIZE; // Adjust loop index
      }
      
      // Ensure 100% at the end
      setDramatizationProgress(100);
    } catch (err: any) {
      console.error("Full book dramatization failed", err);
      const errorStr = (err?.message || JSON.stringify(err)).toLowerCase();
      if (errorStr.includes('429') || errorStr.includes('resource_exhausted') || errorStr.includes('quota') || errorStr.includes('limit')) {
        setErrorMessage("Gemini API quota exceeded. This usually happens with free API keys. Progress has been saved. You can resume later from the Book Orchestrator.");
      } else {
        setErrorMessage("Failed to dramatize full book. Progress has been saved. Please check your connection and try again.");
      }
    } finally {
      // Final save to ensure everything is in the store and DB
      if (latestBook) {
        setBook(latestBook);
        await db.saveBook(latestBook);
        updateBook(book.id, { dramatization: latestBook.dramatization });
      }
      setIsDramatizingFullBook(false);
      setCancelDramatization(false);
    }
  };

  const handleNextPage = (keepPlaying = false) => {
    const current = currentPageRef.current;
    if (current < pagesRef.current.length - 1) {
      const next = current + 1;
      console.log(`[Reader] Moving to next page: ${next}`);
      setCurrentPage(next);
      currentPageRef.current = next; // Update ref immediately
      setCurrentSegmentIndex(null);
      currentSegmentIndexRef.current = null;
      
      if (isPlayingRef.current || keepPlaying) {
        saveProgress(next, 0);
        setCurrentSentenceIndex(0);
        currentSentenceIndexRef.current = 0;
      } else {
        saveProgress(next, null);
        setCurrentSentenceIndex(null);
        currentSentenceIndexRef.current = null;
      }
      
      if (isPlaying && !keepPlaying) stopTTS();
      else if (isPlaying && keepPlaying) {
        // If we keep playing, we still need to stop current audio/synth
        if (synthRef.current) synthRef.current.cancel();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
        }
      }
    }
  };

  const handlePrevPage = () => {
    const current = currentPageRef.current;
    if (current > 0) {
      const next = current - 1;
      console.log(`[Reader] Moving to prev page: ${next}`);
      setCurrentPage(next);
      currentPageRef.current = next; // Update ref immediately
      setCurrentSegmentIndex(null);
      currentSegmentIndexRef.current = null;
      
      if (isPlayingRef.current) {
        saveProgress(next, 0);
        setCurrentSentenceIndex(0);
        currentSentenceIndexRef.current = 0;
      } else {
        saveProgress(next, null);
        setCurrentSentenceIndex(null);
        currentSentenceIndexRef.current = null;
      }
      
      if (isPlaying) stopTTS();
    }
  };

  const handleEndOfPage = () => {
    const shouldContinue = isPlayingRef.current && settingsRef.current.autoTurnPage;
    console.log(`[TTS] End of page reached. Should continue: ${shouldContinue}`);
    
    if (isTurningPageRef.current) {
      console.log("[TTS] Already turning page, skipping handleEndOfPage");
      return;
    }

    if (shouldContinue && currentPageRef.current < pagesRef.current.length - 1) {
      setIsTurningPage(true);
      isTurningPageRef.current = true;
      setTimeout(() => {
        handleNextPage(true);
        setTimeout(() => {
          setIsTurningPage(false);
          isTurningPageRef.current = false;
          if (isPlayingRef.current) {
            console.log("[TTS] Continuing playback on next page");
            startTTS(0);
          }
        }, 600);
      }, 400);
    } else {
      console.log("[TTS] Stopping at end of page");
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopTTS();
    }
  };

  const toggleTTS = () => {
    const effectiveTtsProvider = book?.ttsProvider || 'browser';
    if (isPlaying || isTtsLoading) {
      if (effectiveTtsProvider === 'gemini' && audioRef.current) {
        audioRef.current.pause();
      } else if (synthRef.current) {
        synthRef.current.pause();
      }
      setIsPlaying(false);
      setIsTtsLoading(false);
      isPlayingRef.current = false;
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (effectiveTtsProvider === 'gemini' && audioRef.current && audioRef.current.src && !audioRef.current.ended && audioRef.current.currentTime > 0) {
        audioRef.current.play().catch(e => {
          console.error("Resume play failed", e);
          if (e.name === 'NotAllowedError') {
            setErrorMessage("Audio playback requires user interaction. Please click Play again.");
            setIsPlaying(false);
            isPlayingRef.current = false;
          } else {
            startTTS(currentSentenceIndex !== null ? currentSentenceIndex : 0);
          }
        });
      } else if (effectiveTtsProvider === 'browser' && synthRef.current && synthRef.current.paused) {
        synthRef.current.resume();
      } else {
        startTTS(currentSentenceIndex !== null ? currentSentenceIndex : 0);
      }
    }
  };

  // Fetch translations for the whole page when page changes or subtitles are enabled
  useEffect(() => {
    if (!effectiveIsSubtitleTranslationEnabled || !apiKey) {
      setPageTranslations([]);
      setBatchTranslationStatus('idle');
      return;
    }

    const cleanText = pages[currentPage]
      ?.replace(/<<PAGE:\d+>>/g, '')
      .replace(/<<BOLD_START>>/g, '')
      .replace(/<<BOLD_END>>/g, '')
      .replace(/<<UNDERLINE_START>>/g, '')
      .replace(/<<UNDERLINE_END>>/g, '');

    if (!cleanText) return;

    const sentences = getSentences(cleanText);
    
    if (sentences.length === 0) return;

    // Check if we already have stored subtitles for this page and language
    const storedSubtitles = book?.subtitles?.[effectiveSubtitleLanguage];
    if (storedSubtitles && storedSubtitles.pages[currentPage]) {
      const pageStoredSubtitles = storedSubtitles.pages[currentPage];
      if (Array.isArray(pageStoredSubtitles) && pageStoredSubtitles.length === sentences.length) {
        setPageTranslations(pageStoredSubtitles);
        setBatchTranslationStatus('success');
        setIsTranslatingSubtitle(false);
        return;
      }
    }

    setIsTranslatingSubtitle(true);
    setBatchTranslationStatus('loading');
    translateSentencesBatch(sentences, effectiveSubtitleLanguage, apiKey)
      .then(({ translations, wordMap }) => {
        setPageTranslations(translations);
        setBatchTranslationStatus(translations.length === sentences.length ? 'success' : 'error');
        
        // Cache words if we got them
        if (wordMap && book) {
          const targetLang = effectiveSubtitleLanguage;
          const updatedSubtitles = { ...(book.subtitles || {}) };
          if (!updatedSubtitles[targetLang]) {
            updatedSubtitles[targetLang] = { pages: {}, lastUpdated: Date.now(), wordTranslations: {} };
          }
          if (!updatedSubtitles[targetLang].wordTranslations) {
            updatedSubtitles[targetLang].wordTranslations = {};
          }
          
          Object.entries(wordMap).forEach(([word, trans]) => {
            updatedSubtitles[targetLang].wordTranslations![word.toLowerCase()] = trans as string;
          });
          
          updateBook(book.id, { subtitles: updatedSubtitles });
          db.saveBook({ ...book, subtitles: updatedSubtitles });
        }
      })
      .catch(err => {
        console.error("Batch translation error", err);
        const errStr = err ? (err.message || err.toString() || JSON.stringify(err)) : '';
        if (errStr.includes('400') || errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid')) {
          setErrorMessage("Invalid Gemini API Key for translation. Please check your settings.");
        }
        setPageTranslations([]);
        setBatchTranslationStatus('error');
      })
      .finally(() => {
        setIsTranslatingSubtitle(false);
      });
  }, [currentPage, effectiveIsSubtitleTranslationEnabled, apiKey, effectiveSubtitleLanguage, pages]);

  // Update current subtitle based on sentence index or segment index
  useEffect(() => {
    if (!effectiveIsSubtitleTranslationEnabled || !isPlaying) {
      setCurrentSubtitle('');
      return;
    }

    const cleanText = pages[currentPage]
      ?.replace(/<<PAGE:\d+>>/g, '')
      .replace(/<<BOLD_START>>/g, '')
      .replace(/<<BOLD_END>>/g, '')
      .replace(/<<UNDERLINE_START>>/g, '')
      .replace(/<<UNDERLINE_END>>/g, '');
    const sentences = getSentences(cleanText || '');
    
    let effectiveSentenceIndex = currentSentenceIndex;

    // If in dramatized mode, map segment to sentence index
    if (effectiveSentenceIndex === null && currentSegmentIndex !== null && book?.dramatization?.pages[currentPage]) {
      const segments = book.dramatization.pages[currentPage].segments;
      const currentSegment = segments[currentSegmentIndex];
      if (currentSegment) {
        const segmentText = currentSegment.text.trim();
        // Find sentence that contains this segment or vice versa
        const foundIdx = sentences.findIndex(s => 
          s.includes(segmentText) || segmentText.includes(s.trim())
        );
        if (foundIdx !== -1) effectiveSentenceIndex = foundIdx;
      }
    }

    if (effectiveSentenceIndex === null) {
      setCurrentSubtitle('');
      return;
    }

    const currentSentence = sentences[effectiveSentenceIndex];

    if (!currentSentence) {
      setCurrentSubtitle('');
      return;
    }

    // Check for stored subtitles first
    const storedSubtitles = book?.subtitles?.[effectiveSubtitleLanguage];
    if (storedSubtitles && storedSubtitles.pages[currentPage]) {
      const pageStoredSubtitles = storedSubtitles.pages[currentPage];
      if (Array.isArray(pageStoredSubtitles)) {
        if (pageStoredSubtitles.length === sentences.length && pageStoredSubtitles[effectiveSentenceIndex]) {
          setCurrentSubtitle(pageStoredSubtitles[effectiveSentenceIndex]);
          return;
        }
      }
    }

    if (batchTranslationStatus === 'success' && pageTranslations[effectiveSentenceIndex]) {
      setCurrentSubtitle(pageTranslations[effectiveSentenceIndex]);
    } else if (batchTranslationStatus === 'error') {
      if (apiKey) {
        setIsTranslatingSubtitle(true);
        translateText(currentSentence, effectiveSubtitleLanguage, apiKey)
          .then(trans => {
            if (isPlayingRef.current) setCurrentSubtitle(trans);
          })
          .catch(() => {
            if (isPlayingRef.current) setCurrentSubtitle(currentSentence);
          })
          .finally(() => {
            if (isPlayingRef.current) setIsTranslatingSubtitle(false);
          });
      } else {
        setCurrentSubtitle(currentSentence);
      }
    } else {
      setCurrentSubtitle(currentSentence);
    }
  }, [currentSentenceIndex, currentSegmentIndex, isPlaying, effectiveIsSubtitleTranslationEnabled, pageTranslations, batchTranslationStatus, currentPage, pages, apiKey, effectiveSubtitleLanguage, book?.subtitles]);

  const startTTS = async (startIndex = 0) => {
    console.log(`[TTS] Starting playback on page ${currentPageRef.current} from index ${startIndex}`);
    if (!pagesRef.current[currentPageRef.current]) {
      console.warn("[TTS] No page content found for current page");
      return;
    }
    
    // Reset indices when starting new playback
    setCurrentSentenceIndex(startIndex);
    currentSentenceIndexRef.current = startIndex;
    setCurrentSegmentIndex(null);
    currentSegmentIndexRef.current = null;
    setHighlightRange(null);

    const effectiveTtsProvider = bookRef.current?.ttsProvider || 'browser';

    if (effectiveTtsProvider === 'browser' && synthRef.current) {
      synthRef.current.cancel();
    }
    if (effectiveTtsProvider === 'gemini' && audioRef.current) {
      audioRef.current.pause();
    }
    
    // Clean up markers for reading
    const current = currentPageRef.current;
    const cleanText = getCleanText(pagesRef.current[current]);

    const sentences = getSentences(cleanText);

    setIsPlaying(true);
    setIsTtsLoading(true);
    isPlayingRef.current = true;

    if (effectiveTtsProvider === 'gemini') {
      const user = useStore.getState().user;
      const hasApiKey = apiKeyRef.current || (user?.isApiKeyManaged && user.managedApiKey);
      
      if (!hasApiKey) {
        setErrorMessage('Gemini API Key is required for high-quality TTS. Falling back to browser TTS.');
        setIsTtsLoading(false);
        playWithBrowserTTS(sentences, startIndex);
        return;
      }

      if (bookRef.current?.isDramatizedReadingEnabled) {
        if (book?.dramatization?.pages[current]) {
          playWithDramatizedTTS(current, startIndex);
        } else {
          // Automatic dramatization
          console.log("[TTS] Page not dramatized, analyzing now...");
          handleDramatizePage().then((updatedBook) => {
            if (updatedBook && isPlayingRef.current) {
              playWithDramatizedTTS(currentPageRef.current, startIndex, updatedBook);
            } else if (isPlayingRef.current) {
              console.log("[TTS] Dramatization failed, falling back to Gemini TTS");
              playWithGeminiTTS(sentences, startIndex);
            } else {
              console.log("[TTS] Playback stopped during dramatization");
              setIsTtsLoading(false);
            }
          }).catch(err => {
            console.error("[TTS] Dramatization error in startTTS", err);
            if (isPlayingRef.current) {
              playWithGeminiTTS(sentences, startIndex);
            } else {
              setIsTtsLoading(false);
            }
          });
        }
      } else {
        playWithGeminiTTS(sentences, startIndex);
      }
    } else {
      // Browser TTS
      playWithBrowserTTS(sentences, startIndex);
    }
  };

  const playWithDramatizedTTS = async (pageIndex: number, startIndex: number = 0, currentBook?: Book) => {
    const targetBook = currentBook || book;
    const dramatization = targetBook?.dramatization;
    if (!dramatization || !dramatization.pages[pageIndex]) return;

    setCurrentSentenceIndex(null);
    const originalSegments = dramatization.pages[pageIndex].segments;
    const segments = targetBook.keriKetivEnabled !== false && targetBook.language === 'Hebrew'
      ? originalSegments.map(s => ({ ...s, text: applyKeriKetiv(s.text) }))
      : originalSegments;
      
    const speakerVoices = dramatization.speakerVoices || {};
    
    // Clear existing queue
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    setIsTtsLoading(true);
    isGeneratingChunksRef.current = true;
    try {
      let firstChunkStarted = false;

      await generateMultiSpeakerSpeech(
        segments, 
        apiKeyRef.current, 
        speakerVoices,
        (base64, chunkTimings) => {
          const url = pcmBase64ToWavBase64(base64, 24000);
          if (!firstChunkStarted && isPlayingRef.current) {
            firstChunkStarted = true;
            setIsTtsLoading(false);
            if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.playbackRate = settingsRef.current.ttsSpeed;
              
              audioRef.current.onplay = () => {
                const updateDramatizedHighlight = () => {
                  if (!isPlayingRef.current || !audioRef.current) return;
                  const currentTime = audioRef.current.currentTime;
                  
                  const activeTiming = chunkTimings.find(t => currentTime >= t.start && currentTime <= t.end);
                  if (activeTiming && currentSegmentIndexRef.current !== activeTiming.segmentIdx) {
                    setCurrentSegmentIndex(activeTiming.segmentIdx);
                    currentSegmentIndexRef.current = activeTiming.segmentIdx;
                  }
                  animationFrameRef.current = requestAnimationFrame(updateDramatizedHighlight);
                };
                animationFrameRef.current = requestAnimationFrame(updateDramatizedHighlight);
              };

              audioRef.current.play().catch(e => console.error("Initial play failed", e));
              isPlayingQueueRef.current = true;
            }
          } else if (isPlayingRef.current) {
            audioQueueRef.current.push({ url, timings: chunkTimings });
            // If playback stalled while waiting for chunks, restart it
            if (!isPlayingQueueRef.current && firstChunkStarted && audioRef.current) {
              const next = audioQueueRef.current.shift()!;
              audioRef.current.src = next.url;
              audioRef.current.playbackRate = settingsRef.current.ttsSpeed;
              audioRef.current.play().catch(e => console.error("Restart play failed", e));
              isPlayingQueueRef.current = true;
            }
          }
        },
        () => isPlayingRef.current
      );
      
      // Safety: clear loading if we finished the whole process but never started playing
      if (!firstChunkStarted) {
        setIsTtsLoading(false);
      }
      
    } catch (err) {
      console.error("Dramatized TTS failed", err);
      setIsTtsLoading(false);
      setErrorMessage("Failed to generate dramatized speech.");
    } finally {
      isGeneratingChunksRef.current = false;
    }
  };

  const playWithGeminiTTS = async (sentences: string[], startGlobalIdx: number) => {
    setCurrentSegmentIndex(null);
    
    const processedSentences = book?.keriKetivEnabled !== false && book?.language === 'Hebrew'
      ? sentences.map(s => applyKeriKetiv(s))
      : sentences;
      
    const chunks = buildTtsChunks(processedSentences);
    
    let currentChunkIdx = chunks.findIndex(c => 
      startGlobalIdx >= c.startIndex && startGlobalIdx < c.startIndex + c.sentences.length
    );
    if (currentChunkIdx === -1) currentChunkIdx = 0;

    let isRateLimited = false;
    let localStartIdx = startGlobalIdx > chunks[currentChunkIdx].startIndex ? startGlobalIdx - chunks[currentChunkIdx].startIndex : 0;

    // Clear existing queue
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const fetchAudio = async (chunkIdx: number) => {
      if (chunkIdx >= chunks.length || isRateLimited) return null;
      try {
        const effectiveGeminiVoice = bookRef.current?.geminiVoice || 'Kore';
        const bookVoice = bookRef.current?.dramatization?.speakerVoices?.['Narrator'] || effectiveGeminiVoice;
        return await generateSpeech(chunks[chunkIdx].text, bookVoice, apiKeyRef.current, () => isPlayingRef.current);
      } catch (e: any) {
        console.error("Failed to fetch audio", e);
        const errStr = e ? (e.message || e.toString() || JSON.stringify(e)) : '';
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
           isRateLimited = true;
           setErrorMessage("Gemini API rate limit exceeded. Falling back to browser voice.");
        } else if (errStr.includes('400') || errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid')) {
           isRateLimited = true;
           setErrorMessage("Invalid Gemini API Key. Please check your settings. Falling back to browser voice.");
        }
        return null;
      }
    };

    setIsTtsLoading(true);
    isGeneratingChunksRef.current = true;
    
    try {
      let firstChunkStarted = false;
      
      for (let i = currentChunkIdx; i < chunks.length; i++) {
        if (!isPlayingRef.current || isRateLimited) break;
        
        const base64 = await fetchAudio(i);
        if (!base64 || !isPlayingRef.current) break;
        
        const url = pcmBase64ToWavBase64(base64, 24000);
        const chunk = chunks[i];
        
        let searchIdx = 0;
        const sentenceRanges = chunk.sentences.map(s => {
          const start = chunk.text.indexOf(s, searchIdx);
          const end = start + s.length;
          searchIdx = end;
          return { start, end };
        });

        const queueItem = { 
          url, 
          timings: [], 
          sentenceRanges, 
          startIndex: chunk.startIndex, 
          textLength: chunk.text.length 
        };

        if (!firstChunkStarted) {
          firstChunkStarted = true;
          setIsTtsLoading(false);
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.playbackRate = settingsRef.current.ttsSpeed;
            
            // Handle local start offset for the very first chunk
            if (i === currentChunkIdx && localStartIdx > 0) {
              const startChar = sentenceRanges[localStartIdx].start;
              const startProgress = startChar / chunk.text.length;
              audioRef.current.onloadedmetadata = () => {
                if (audioRef.current && !isNaN(audioRef.current.duration) && audioRef.current.duration !== Infinity) {
                  audioRef.current.currentTime = startProgress * audioRef.current.duration;
                  audioRef.current.play().catch(e => console.error(e));
                }
              };
            } else {
              audioRef.current.play().catch(e => console.error(e));
            }
            isPlayingQueueRef.current = true;
          }
        } else if (isPlayingRef.current) {
          audioQueueRef.current.push(queueItem);
          // If playback stalled while waiting for chunks, restart it
          if (!isPlayingQueueRef.current && audioRef.current) {
            const next = audioQueueRef.current.shift()!;
            audioRef.current.src = next.url;
            audioRef.current.playbackRate = settingsRef.current.ttsSpeed;
            audioRef.current.play().catch(e => console.error("Restart play failed", e));
            isPlayingQueueRef.current = true;
          }
        }
      }
      
      if (!firstChunkStarted) setIsTtsLoading(false);
      if (isRateLimited) playWithBrowserTTS(sentences, startGlobalIdx);
      
    } catch (err) {
      console.error("Gemini TTS playback failed", err);
      setIsTtsLoading(false);
    } finally {
      isGeneratingChunksRef.current = false;
    }
  };

  const playWithBrowserTTS = (sentences: string[], startIdx: number) => {
    setCurrentSegmentIndex(null);
    let currentIdx = startIdx;

    const playNext = async () => {
      if (!isPlayingRef.current) return;
      
      if (currentIdx >= sentences.length) {
        handleEndOfPage();
        return;
      }

      const originalSentence = sentences[currentIdx].trim();
      if (!originalSentence) {
        currentIdx++;
        playNext();
        return;
      }

      const sentence = book?.keriKetivEnabled !== false && book?.language === 'Hebrew'
        ? applyKeriKetiv(originalSentence)
        : originalSentence;

      setCurrentSentenceIndex(currentIdx);
      saveProgress(currentPageRef.current, currentIdx);

      if (!isPlayingRef.current) return;

      setIsTtsLoading(false);
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = settingsRef.current.ttsSpeed;
      
      const bookVoiceName = book?.ttsVoice || book?.dramatization?.speakerVoices?.['Narrator'];
      const preferredVoiceName = bookVoiceName || settingsRef.current.ttsVoice;

      if (preferredVoiceName) {
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.name === preferredVoiceName);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      if (book?.language) {
        const langMap: Record<string, string> = {
          'english': 'en-US',
          'spanish': 'es-ES',
          'hebrew': 'he-IL',
          'french': 'fr-FR',
          'german': 'de-DE',
          'russian': 'ru-RU',
          'arabic': 'ar-SA'
        };
        utterance.lang = langMap[book.language.toLowerCase()] || book.language;
      }
      
      utterance.onend = () => {
        if (!isPlayingRef.current) return;
        currentIdx++;
        if (currentIdx >= sentences.length) {
          handleEndOfPage();
        } else {
          playNext();
        }
      };

      utteranceRef.current = utterance;
      synthRef.current?.speak(utterance);
    };

    playNext();
  };

  const stopTTS = () => {
    console.log("[TTS] Stopping playback");
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setIsTtsLoading(false);
    isPlayingRef.current = false;
    setCurrentSubtitle('');
    setCurrentSegmentIndex(null);
    currentSegmentIndexRef.current = null;
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    isGeneratingChunksRef.current = false;
    
    // Save current progress before stopping
    saveProgress(currentPageRef.current, currentSentenceIndex);
  };

  const handleWordClick = async (word: string, fullText: string) => {
    const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();
    if (!cleanWord) return;

    setSelectedText(cleanWord);
    
    // 1. Check Glossary first (from AI Analysis)
    const glossaryEntry = book?.analysis?.glossary?.find(
      (g: any) => g.term.toLowerCase() === cleanWord.toLowerCase()
    );
    if (glossaryEntry) {
      setAiResult({ type: 'trans', content: glossaryEntry.definition });
      return;
    }

    // 2. Check Stored Word Translations (Cache)
    const targetLang = effectiveSubtitleLanguage;
    const storedTranslation = book?.subtitles?.[targetLang]?.wordTranslations?.[cleanWord.toLowerCase()];
    if (storedTranslation) {
      setAiResult({ type: 'trans', content: storedTranslation });
      return;
    }

    // 3. Not in cache, need to translate
    setIsAiLoading(true);
    setAiResult({ type: 'trans', content: '' });

    try {
      let translation = '';
      
      // Try to find sentence context
      const sentences = getSentences(getCleanText(fullText));
      const sentenceWithWord = sentences.find(s => s.includes(cleanWord));
      
      if (sentenceWithWord && effectiveIsSubtitleTranslationEnabled) {
        // Check if we have a translation for this sentence in subtitles
        const sentenceIdx = sentences.indexOf(sentenceWithWord);
        const bookSubtitles = book?.subtitles?.[targetLang]?.pages[currentPage];
        const sentenceTranslation = bookSubtitles?.[sentenceIdx] || pageTranslations[sentenceIdx];
        
        if (sentenceTranslation) {
          translation = await translateWordInContext(cleanWord, sentenceWithWord, sentenceTranslation, targetLang, apiKey);
        }
      }

      if (!translation) {
        translation = await translateText(cleanWord, targetLang, apiKey);
      }
      
      // 4. Save to Cache in Database
      if (translation && book) {
        const updatedSubtitles = { ...(book.subtitles || {}) };
        if (!updatedSubtitles[targetLang]) {
          updatedSubtitles[targetLang] = { pages: {}, lastUpdated: Date.now(), wordTranslations: {} };
        }
        if (!updatedSubtitles[targetLang].wordTranslations) {
          updatedSubtitles[targetLang].wordTranslations = {};
        }
        
        updatedSubtitles[targetLang].wordTranslations[cleanWord.toLowerCase()] = translation;
        
        const updatedBook = { ...book, subtitles: updatedSubtitles };
        setBook(updatedBook);
        updateBook(book.id, { subtitles: updatedSubtitles });
        await db.saveBook(updatedBook);
      }

      setAiResult({ type: 'trans', content: translation });
    } catch (err) {
      setAiResult({ type: 'trans', content: 'Error translating word.' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleTextSelection = async (type: 'def' | 'trans' | 'quote') => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') return;
    
    const text = selection.toString().trim();
    setSelectedText(text);

    if (type === 'quote') {
      const newQuote = {
        id: crypto.randomUUID(),
        text,
        color: 'yellow',
        page: currentPage + 1,
      };
      const updatedQuotes = [...quotes, newQuote];
      setQuotes(updatedQuotes);
      if (book) {
        await db.saveQuotes(book.id, updatedQuotes);
      }
      setShowQuotes(true);
      return;
    }

    setIsAiLoading(true);
    setAiResult({ type, content: '' });

    try {
      if (type === 'def') {
        const context = selection.anchorNode?.parentElement?.textContent || text;
        const def = await getDefinition(text, context, apiKey);
        setAiResult({ type, content: def });
      } else {
        const trans = await translateText(text, effectiveSubtitleLanguage, apiKey);
        setAiResult({ type, content: trans });
      }
    } catch (err) {
      setAiResult({ type, content: 'Error: Please check your API key in settings.' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDeleteQuote = async (id: string) => {
    const updatedQuotes = quotes.filter(q => q.id !== id);
    setQuotes(updatedQuotes);
    if (book) {
      await db.saveQuotes(book.id, updatedQuotes);
    }
  };

  if (!book || pages.length === 0) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  // Format the text for display (handle markers and highlighting)
  const renderPageContent = (text: string) => {
    let processedText = text;
    if (settings.highlightSavedQuotes && quotes.length > 0) {
      // Sort quotes by length descending to avoid partial replacements of longer quotes
      const sortedQuotes = [...quotes].sort((a, b) => b.text.length - a.text.length);
      sortedQuotes.forEach(q => {
        if (q.text && processedText.includes(q.text)) {
           // Simple replace, might not handle multiple occurrences perfectly but good enough for now
           processedText = processedText.replace(q.text, `<<QUOTE_START>>${q.text}<<QUOTE_END>>`);
        }
      });
    }

  const getGeminiVoiceGender = (voice: string): 'male' | 'female' | 'neutral' => {
    const maleVoices = ['Puck', 'Charon', 'Fenrir', 'Orpheus'];
    const femaleVoices = ['Kore', 'Zephyr', 'Aoede', 'Cassiopeia'];
    if (maleVoices.includes(voice)) return 'male';
    if (femaleVoices.includes(voice)) return 'female';
    return 'neutral';
  };

  const getHighlightClass = () => {
    if (settings.highlightStyle === 'character-based') {
      let speaker = 'Narrator';
      let gender: 'male' | 'female' | 'neutral' = 'neutral';

      if (book.isDramatizedReadingEnabled && currentSegmentIndex !== null && book.dramatization?.pages[currentPage]) {
        const segments = book.dramatization.pages[currentPage].segments;
        const currentSegment = segments[currentSegmentIndex];
        if (currentSegment) {
          speaker = currentSegment.speaker;
          gender = book.dramatization.speakerGenders?.[speaker] || 'neutral';
        }
      } else {
        // Dramatization off, use book's narrator voice or global voice
        speaker = 'Global';
        const effectiveGeminiVoice = book?.geminiVoice || settings.geminiVoice;
        const activeVoice = book?.dramatization?.speakerVoices?.['Narrator'] || effectiveGeminiVoice;
        if ((book?.ttsProvider || 'browser') === 'gemini') {
          gender = getGeminiVoiceGender(activeVoice);
        } else {
          // For browser voices, we could try to detect gender from name, but neutral is safer fallback
          gender = 'neutral';
        }
      }
      
      const femaleColors = [
        'bg-pink-200 text-pink-900',
        'bg-rose-200 text-rose-900',
        'bg-fuchsia-200 text-fuchsia-900',
        'bg-purple-200 text-purple-900',
      ];
      const maleColors = [
        'bg-blue-200 text-blue-900',
        'bg-cyan-200 text-cyan-900',
        'bg-indigo-200 text-indigo-900',
        'bg-sky-200 text-sky-900',
      ];
      const neutralColors = [
        'bg-emerald-200 text-emerald-900',
        'bg-amber-200 text-amber-900',
        'bg-orange-200 text-orange-900',
        'bg-teal-200 text-teal-900',
        'bg-lime-200 text-lime-900',
      ];

      const hash = speaker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const baseClass = 'rounded px-1 py-0.5 shadow-sm';
      
      if (gender === 'female') {
        return `${femaleColors[hash % femaleColors.length]} ${baseClass}`;
      } else if (gender === 'male') {
        return `${maleColors[hash % maleColors.length]} ${baseClass}`;
      } else {
        return `${neutralColors[hash % neutralColors.length]} ${baseClass}`;
      }
    }

    switch (settings.highlightStyle) {
        case 'underline': return 'underline decoration-yellow-400 decoration-2 underline-offset-4';
        case 'bold': return 'font-bold text-zinc-900';
        case 'text-blue': return 'text-blue-600 font-medium';
        case 'yellow-bg':
        default: return 'bg-yellow-200 text-black rounded px-1 py-0.5';
      }
    };

    const renderRawText = (raw: string, initialBold: boolean, initialUnderline: boolean, initialQuote: boolean = false) => {
      const parts = raw.split(/(<<BOLD_START>>|<<BOLD_END>>|<<UNDERLINE_START>>|<<UNDERLINE_END>>|<<QUOTE_START>>|<<QUOTE_END>>|<<PAGE:\d+>>|\n)/g);
      let isBold = initialBold;
      let isUnderline = initialUnderline;
      let isQuote = initialQuote;
      
      const nodes = parts.map((part, i) => {
        if (!part) return null;
        if (part === '<<BOLD_START>>') { isBold = true; return null; }
        if (part === '<<BOLD_END>>') { isBold = false; return null; }
        if (part === '<<UNDERLINE_START>>') { isUnderline = true; return null; }
        if (part === '<<UNDERLINE_END>>') { isUnderline = false; return null; }
        if (part === '<<QUOTE_START>>') { isQuote = true; return null; }
        if (part === '<<QUOTE_END>>') { isQuote = false; return null; }
        if (part.startsWith('<<PAGE:')) return null;
        if (part === '\n') return <br key={i} />;
        
        let className = "";
        if (isBold) className += "font-bold text-zinc-900 ";
        if (isUnderline) className += "underline decoration-zinc-400 underline-offset-4 ";
        if (isQuote) className += "bg-green-200/60 dark:bg-green-900/40 rounded px-1 ";

        if (isTranslationModeActive) {
          const words = part.split(/(\s+|[.,/#!$%^&*;:{}=\-_`~()])/);
          return words.map((word, j) => {
            if (word.trim() === '' || /^[.,/#!$%^&*;:{}=\-_`~()]+$/.test(word)) return word;
            return (
              <span 
                key={`${i}-${j}`} 
                className={cn(className, "cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border-b border-transparent hover:border-blue-300")}
                onClick={(e) => {
                  e.stopPropagation();
                  handleWordClick(word, pages[currentPage]);
                }}
              >
                {word}
              </span>
            );
          });
        }

        if (className) {
           return <span key={i} className={className.trim()}>{part}</span>;
        }
        return <span key={i}>{part}</span>;
      });
      
      return { nodes, finalBold: isBold, finalUnderline: isUnderline, finalQuote: isQuote };
    };

    if (currentSentenceIndex === null && currentSegmentIndex === null && highlightRange === null) {
      return renderRawText(processedText, false, false, false).nodes;
    }

    // 1. Build clean text and a mapping from clean index to raw index
    let cleanText = '';
    const cleanToRaw: number[] = [];
    
    const markerRegex = /(<<BOLD_START>>|<<BOLD_END>>|<<UNDERLINE_START>>|<<UNDERLINE_END>>|<<QUOTE_START>>|<<QUOTE_END>>|<<PAGE:\d+>>)/g;
    let rawIdx = 0;
    let match;
    
    while ((match = markerRegex.exec(processedText)) !== null) {
      const before = processedText.substring(rawIdx, match.index);
      for (let i = 0; i < before.length; i++) {
        cleanText += before[i];
        cleanToRaw.push(rawIdx + i);
      }
      rawIdx = markerRegex.lastIndex;
    }
    const remaining = processedText.substring(rawIdx);
    for (let i = 0; i < remaining.length; i++) {
      cleanText += remaining[i];
      cleanToRaw.push(rawIdx + i);
    }
    
    let startCleanIdx = -1;
    let endCleanIdx = -1;

    if (highlightRange) {
      startCleanIdx = highlightRange.start;
      endCleanIdx = highlightRange.end;
    } else if (currentSegmentIndex !== null && book.dramatization?.pages[currentPage]) {
      // Highlight by segment (Dramatized TTS)
      const segments = book.dramatization.pages[currentPage].segments;
      const currentSegment = segments[currentSegmentIndex];
      
      if (!currentSegment) return renderRawText(processedText, false, false, false).nodes;

      const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();
      const normalizedClean = normalize(cleanText);
      const normalizedSegment = normalize(currentSegment.text);

      let searchIdx = 0;
      for (let i = 0; i < currentSegmentIndex; i++) {
        const prevSegment = segments[i];
        const idx = cleanText.indexOf(prevSegment.text, searchIdx);
        if (idx !== -1) {
          searchIdx = idx + prevSegment.text.length;
        }
      }

      startCleanIdx = cleanText.indexOf(currentSegment.text, searchIdx);
      
      // Fuzzy fallback if exact match fails
      if (startCleanIdx === -1) {
        const idx = normalizedClean.indexOf(normalizedSegment);
        if (idx !== -1) {
          // This is a rough mapping back to non-normalized indices, but better than nothing
          startCleanIdx = idx; 
          endCleanIdx = idx + currentSegment.text.length;
        }
      } else {
        endCleanIdx = startCleanIdx + currentSegment.text.length;
      }
    } else if (currentSentenceIndex !== null) {
      // 2. Find sentence boundaries in clean text
      const sentences = getSentences(cleanText);
      const currentSentence = sentences[currentSentenceIndex];
      
      if (!currentSentence) return renderRawText(processedText, false, false, false).nodes;

      let searchIdx = 0;
      for (let i = 0; i < currentSentenceIndex; i++) {
        const prevSentence = sentences[i];
        const idx = cleanText.indexOf(prevSentence, searchIdx);
        if (idx !== -1) {
          searchIdx = idx + prevSentence.length;
        }
      }

      startCleanIdx = cleanText.indexOf(currentSentence, searchIdx);
      if (startCleanIdx !== -1) {
        endCleanIdx = startCleanIdx + currentSentence.length;
      }
    }

    if (startCleanIdx === -1) return renderRawText(processedText, false, false, false).nodes;
    
    // 3. Map clean indices back to raw indices
    const startRawIdx = cleanToRaw[startCleanIdx];
    const endRawIdx = endCleanIdx < cleanToRaw.length ? cleanToRaw[endCleanIdx] : processedText.length;
    
    // 4. Split raw text into 3 parts
    const beforeRaw = processedText.substring(0, startRawIdx);
    const highlightRaw = processedText.substring(startRawIdx, endRawIdx);
    const afterRaw = processedText.substring(endRawIdx);
    
    const beforeRender = renderRawText(beforeRaw, false, false, false);
    const highlightRender = renderRawText(highlightRaw, beforeRender.finalBold, beforeRender.finalUnderline, beforeRender.finalQuote);
    const afterRender = renderRawText(afterRaw, highlightRender.finalBold, highlightRender.finalUnderline, highlightRender.finalQuote);
    
    return (
      <>
        {beforeRender.nodes}
        <span 
          className={cn("transition-colors duration-200", getHighlightClass())} 
          data-highlighted="true"
        >
          {highlightRender.nodes}
        </span>
        {afterRender.nodes}
      </>
    );
  };

  return (
    <div className={cn(
      "flex flex-col h-full transition-all duration-300 relative",
      isImmersive ? "bg-[#f5f5f0]" : settings.theme === 'dark' ? "bg-zinc-900 text-zinc-100" : "bg-zinc-50 text-zinc-900"
    )}>
      {isWaitingForQuota && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <Loader2 size={18} className="animate-spin text-amber-600" />
          <span className="text-sm font-medium">Gemini API quota reached. Waiting to resume...</span>
        </div>
      )}

      {isTtsSlow && !isWaitingForQuota && !isDramatizing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <Loader2 size={18} className="animate-spin text-blue-600" />
          <span className="text-sm font-medium">AI is generating speech... this may take a moment.</span>
        </div>
      )}

      {isDramatizing && !isWaitingForQuota && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-3 bg-purple-50 text-purple-800 rounded-xl border border-purple-200 flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <Loader2 size={18} className="animate-spin text-purple-600" />
          <span className="text-sm font-medium">AI is analyzing characters and voices...</span>
        </div>
      )}

      {errorMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center shadow-lg min-w-[300px]">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 ml-4">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Bar */}
      {!isImmersive && (
        <header className={cn(
          "flex items-center justify-between p-4 border-b shrink-0",
          settings.theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
        )}>
          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className={cn("h-8 w-8 md:h-10 md:w-10", settings.theme === 'dark' ? "text-zinc-300 hover:text-white" : "")}>
              <ChevronLeft size={20} />
            </Button>
            <div className="min-w-0">
              <h1 className={cn("font-semibold leading-tight text-sm md:text-base truncate", settings.theme === 'dark' ? "text-zinc-100" : "text-zinc-900")}>{book.title}</h1>
              <p className={cn("text-[10px] md:text-xs truncate", settings.theme === 'dark' ? "text-zinc-400" : "text-zinc-500")}>{book.author}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 md:gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleDramatizePage} 
              disabled={isDramatizing || isDramatizingFullBook}
              title="Dramatize Page (AI Voices)"
              className="h-8 w-8 md:h-9 md:w-9"
            >
              <Captions size={18} className={cn(
                book.dramatization?.pages[currentPage] ? "text-emerald-500" : "text-zinc-400",
                isDramatizing && "animate-pulse text-emerald-400"
              )} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowDramatizeConfirm(true)} 
              disabled={isDramatizing || isDramatizingFullBook}
              title="Dramatize Full Book (AI Analysis)"
              className="h-8 w-8 md:h-9 md:w-9"
            >
              <Sparkles size={18} className={cn(
                book.dramatization?.pages && Object.keys(book.dramatization.pages).length === pages.length ? "text-emerald-500" : "text-zinc-400",
                isDramatizingFullBook && "animate-pulse text-emerald-400"
              )} />
            </Button>

            <div className="relative">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="h-8 w-8 md:h-9 md:w-9"
              >
                <MoreVertical size={18} className="text-zinc-400" />
              </Button>

              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className={cn(
                    "absolute right-0 mt-2 w-48 rounded-2xl shadow-xl border z-50 py-2 animate-in fade-in zoom-in-95 duration-200",
                    settings.theme === 'dark' ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"
                  )}>
                    <button 
                      onClick={() => { setShowSummary(!showSummary); setShowXRay(false); setShowQuotes(false); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      <BookOpen size={16} className={showSummary ? "text-purple-500" : "text-zinc-400"} />
                      <span>AI Summary</span>
                    </button>
                    <button 
                      onClick={() => { setShowXRay(!showXRay); setShowQuotes(false); setShowSummary(false); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      <Zap size={16} className={showXRay ? "text-yellow-500" : "text-zinc-400"} />
                      <span>X-Ray</span>
                    </button>
                    <button 
                      onClick={() => { setShowQuotes(!showQuotes); setShowXRay(false); setShowSummary(false); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      <MessageSquare size={16} className={showQuotes ? "text-blue-500" : "text-zinc-400"} />
                      <span>Quotes</span>
                    </button>
                    <button 
                      onClick={() => { 
                        if (!book) return;
                        const newValue = !book.isDramatizedReadingEnabled;
                        updateBook(book.id, { isDramatizedReadingEnabled: newValue });
                        db.updateBookField(book.id, 'isDramatizedReadingEnabled', newValue);
                        setBook({ ...book, isDramatizedReadingEnabled: newValue });
                        setShowMoreMenu(false); 
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      <Sparkles size={16} className={book?.isDramatizedReadingEnabled ? "text-emerald-500" : "text-zinc-400"} />
                      <span>{book?.isDramatizedReadingEnabled ? 'Disable AI Voices' : 'Enable AI Voices'}</span>
                    </button>
                    <button 
                      onClick={() => { setShowTtsSettings(true); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      <Volume2 size={16} className="text-zinc-400" />
                      <span>Voice Settings</span>
                    </button>
                    <div className={cn("h-px my-1", settings.theme === 'dark' ? "bg-zinc-700" : "bg-zinc-100")} />
                    <button 
                      onClick={() => { updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      {settings.theme === 'dark' ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-zinc-400" />}
                      <span>{settings.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                    <button 
                      onClick={() => { setIsImmersive(true); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        settings.theme === 'dark' ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
                      )}
                    >
                      <BookOpen size={16} className="text-zinc-400" />
                      <span>Immersive Mode</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Main Reader Area */}
      <div className="flex-1 overflow-hidden relative flex">
        {isImmersive && (
          <button 
            onClick={() => setIsImmersive(false)}
            className="absolute top-4 right-4 z-50 p-2 bg-black/10 hover:bg-black/20 text-black/60 hover:text-black/80 rounded-full backdrop-blur-sm transition-all shadow-sm"
            title="Exit Immersive Mode"
          >
            <X size={20} />
          </button>
        )}
        
        {/* Left Nav */}
        <button 
          onClick={handlePrevPage}
          disabled={currentPage === 0}
          className="hidden md:flex w-16 items-center justify-center hover:bg-black/5 disabled:opacity-0 transition-colors shrink-0"
        >
          <ChevronLeft size={32} className="text-zinc-400" />
        </button>

        {/* Content */}
        <div 
          ref={contentRef}
          className={cn(
            "flex-1 overflow-y-auto px-4 py-6 md:px-12 lg:px-24 scroll-smooth relative",
            isPlaying && currentSubtitle ? "pb-64 md:pb-80" : "pb-32"
          )}
          onClick={(e) => {
            // Simple tap-to-turn on mobile
            if (window.innerWidth < 768) {
              const clickX = e.clientX;
              const width = window.innerWidth;
              if (clickX < width * 0.3) handlePrevPage();
              else if (clickX > width * 0.7) handleNextPage();
              else setIsImmersive(!isImmersive); // Tap center to toggle immersive
            }
          }}
        >
          {isTurningPage && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[2px] transition-all duration-300">
              <div className="flex flex-col items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-lg border border-zinc-100">
                <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
                <span className="text-sm font-medium text-zinc-600">Turning page...</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsTurningPage(false)}
                  className="mt-2 text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <div 
            className={cn(
              "max-w-4xl mx-auto prose transition-opacity duration-300",
              isTurningPage ? "opacity-30" : "opacity-100",
              settings.fontFamily === 'serif' ? 'font-serif' : settings.fontFamily === 'mono' ? 'font-mono' : 'font-sans',
              settings.theme === 'dark' ? 'prose-invert prose-zinc' : 'prose-zinc'
            )}
            style={{ fontSize: `${settings.fontSize}px`, lineHeight: 1.8 }}
            dir={book.textDirection || 'ltr'}
            onMouseUp={() => {
              // Show a small popover or just rely on the buttons below for now
            }}
          >
            {renderPageContent(pages[currentPage])}
          </div>
        </div>

        {/* Right Nav */}
        <button 
          onClick={handleNextPage}
          disabled={currentPage === pages.length - 1}
          className="hidden md:flex w-16 items-center justify-center hover:bg-black/5 disabled:opacity-0 transition-colors shrink-0"
        >
          <ChevronRight size={32} className="text-zinc-400" />
        </button>

        {/* Side Panels */}
        {showQuotes && (
          <QuotesPanel 
            quotes={quotes} 
            onClose={() => setShowQuotes(false)} 
            onDelete={handleDeleteQuote} 
          />
        )}
        {showXRay && (
          <XRayPanel 
            data={{
              ...(book.analysis as any),
              speakerVoices: book.dramatization?.speakerVoices
            }} 
            onClose={() => setShowXRay(false)} 
            onUpdateVoice={async (name, voice) => {
              if (!book || !book.dramatization) return;
              const updatedDramatization = {
                ...book.dramatization,
                speakerVoices: {
                  ...book.dramatization.speakerVoices,
                  [name]: voice
                }
              };
              const updatedBook = { ...book, dramatization: updatedDramatization };
              setBook(updatedBook);
              await db.saveBook(updatedBook);
              updateBook(book.id, { dramatization: updatedDramatization });
            }}
          />
        )}

        {showDramatizeConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold dark:text-white">Dramatize Full Book</h3>
              </div>
              
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                AI will analyze all pages to identify characters and assign unique voices. This provides a much more immersive reading experience.
              </p>
              
              {book.dramatization?.pages && Object.keys(book.dramatization.pages).length > 0 && (
                <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">Current Progress</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {Object.keys(book.dramatization.pages).length} of {pages.length} pages already dramatized.
                  </p>
                </div>
              )}
              
              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => handleDramatizeFullBook(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {book.dramatization?.pages && Object.keys(book.dramatization.pages).length > 0 ? "Continue Dramatization" : "Start Dramatization"}
                </Button>
                
                {book.dramatization?.pages && Object.keys(book.dramatization.pages).length > 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => handleDramatizeFullBook(true)}
                    className="w-full"
                  >
                    Start Fresh (Overwrite existing)
                  </Button>
                )}
                
                <Button 
                  variant="ghost" 
                  onClick={() => setShowDramatizeConfirm(false)}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {isDramatizingFullBook && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-zinc-800 text-center">
              <Sparkles className="w-12 h-12 text-emerald-500 mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-bold mb-2 dark:text-white">Dramatizing Full Book</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">
                AI is analyzing characters and assigning voices for the entire book. This may take a few minutes.
              </p>
              
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-3 mb-2 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500 ease-out" 
                  style={{ width: `${dramatizationProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-sm font-medium text-zinc-500 dark:text-zinc-400">
                <span>Progress</span>
                <span>{dramatizationProgress === 100 ? <Check size={16} className="text-emerald-500" /> : `${dramatizationProgress}%`}</span>
              </div>
              
              <Button 
                variant="outline" 
                className="mt-8 w-full"
                onClick={() => {
                  cancelRef.current = true;
                  setCancelDramatization(true);
                }}
              >
                {cancelDramatization ? "Cancelling..." : "Cancel Analysis"}
              </Button>
            </div>
          </div>
        )}
        {showSummary && (
          <div className="fixed inset-y-0 right-0 w-full md:w-80 bg-white border-l border-zinc-200 shadow-xl flex flex-col h-full z-[60] animate-in slide-in-from-right-full md:slide-in-from-right-8">
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2 text-zinc-900 font-medium">
                <Sparkles size={18} className="text-purple-500" />
                AI Summary
              </div>
              <button onClick={() => setShowSummary(false)} className="text-zinc-400 hover:text-zinc-900 transition-colors p-2">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {isAnalyzingSummary ? (
                <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-3">
                  <div className="w-6 h-6 border-2 border-zinc-300 border-t-purple-500 rounded-full animate-spin" />
                  <p className="text-sm">Analyzing book content...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Summary */}
                  {(summaryText || book?.analysis?.summary) && (
                    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        Summary
                      </h4>
                      <p className="leading-relaxed text-zinc-700 text-sm whitespace-pre-wrap">{summaryText || book?.analysis?.summary}</p>
                    </section>
                  )}

                  {/* Characters */}
                  {book?.analysis?.characters && book.analysis.characters.length > 0 && (
                    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        Characters
                      </h4>
                      <div className="space-y-3">
                        {book.analysis.characters.map((char: any, idx: number) => (
                          <div key={idx} className="bg-zinc-50/80 p-3 rounded-2xl border border-zinc-100 hover:border-zinc-200 transition-colors group">
                            <div className="flex justify-between items-start mb-1.5">
                              <span className="font-bold text-zinc-900 text-sm group-hover:text-purple-600 transition-colors">{char.name}</span>
                              <span className="text-[9px] bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider">{char.role}</span>
                            </div>
                            <p className="text-xs text-zinc-600 leading-relaxed font-light">{char.description}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Themes */}
                  {book?.analysis?.themes && book.analysis.themes.length > 0 && (
                    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        Themes
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {book.analysis.themes.map((theme: string, idx: number) => (
                          <span key={idx} className="text-[11px] bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full border border-purple-100 font-medium">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Glossary */}
                  {book?.analysis?.glossary && book.analysis.glossary.length > 0 && (
                    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Unique Terms
                      </h4>
                      <div className="space-y-4">
                        {book.analysis.glossary.map((it: any, idx: number) => (
                          <div key={idx} className="group">
                            <div className="font-bold text-zinc-900 text-sm mb-0.5 group-hover:text-purple-600 transition-colors">{it.term}</div>
                            <div className="text-xs text-zinc-500 leading-relaxed font-light">{it.definition}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Dramatization Status */}
                  <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-[400ms]">
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Dramatization
                    </h4>
                    <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-emerald-800">Status</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                          {book.dramatization?.pages ? Object.keys(book.dramatization.pages).length : 0} / {pages.length} Pages
                        </span>
                      </div>
                      <div className="w-full bg-emerald-100 h-1.5 rounded-full overflow-hidden mb-4">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-1000" 
                          style={{ width: `${Math.round(((book.dramatization?.pages ? Object.keys(book.dramatization.pages).length : 0) / pages.length) * 100)}%` }} 
                        />
                      </div>
                      {(!book.dramatization?.pages || Object.keys(book.dramatization.pages).length < pages.length) && (
                        <Button 
                          variant="primary" 
                          size="sm" 
                          className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 rounded-xl text-xs gap-2"
                          onClick={() => { setShowDramatizeConfirm(true); setShowSummary(false); }}
                        >
                          <Sparkles size={14} />
                          Dramatize Full Book
                        </Button>
                      )}
                    </div>
                  </section>

                  {!isAnalyzingSummary && !summaryText && !book?.analysis?.summary && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="bg-zinc-100 p-4 rounded-full mb-4">
                        <Sparkles size={24} className="text-zinc-300" />
                      </div>
                      <p className="text-sm text-zinc-500 mb-6">No analysis results yet.</p>
                      <Button variant="primary" size="sm" onClick={handleAnalyzeSummary}>
                        Start AI Analysis
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isDramatizing && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 animate-in zoom-in">
              <div className="w-12 h-12 border-4 border-zinc-100 border-t-zinc-900 rounded-full animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-zinc-900">Preparing Dramatized Reading...</p>
                <p className="text-sm text-zinc-500">AI is analyzing characters and assigning voices.</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsDramatizing(false)}
                className="mt-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Subtitles Overlay */}
        {isPlaying && currentSubtitle && (
          <div className="fixed bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-40 pointer-events-none">
            <div className="bg-black/80 backdrop-blur-md text-white px-4 md:px-6 py-3 md:py-4 rounded-2xl text-center shadow-2xl border border-white/10 mx-auto w-full max-h-[30vh] overflow-y-auto pointer-events-auto">
              {isTranslatingSubtitle ? (
                <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Translating...
                </div>
              ) : (
                <div className="text-base md:text-xl font-medium leading-relaxed whitespace-pre-wrap" dir={book.textDirection || 'auto'} style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  {currentSubtitle}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Translation Mode Indicator */}
        {isTranslationModeActive && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 p-2 px-4 bg-blue-500 text-white rounded-full text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            <Languages size={12} />
            <span>Tap any word to translate</span>
            <button onClick={() => setIsTranslationModeActive(false)} className="ml-2 hover:bg-white/20 rounded-full p-0.5">
              <X size={12} />
            </button>
          </div>
        )}

        {/* TTS Settings Modal */}
        {showTtsSettings && book && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className={cn(
              "w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200",
              settings.theme === 'dark' ? "bg-zinc-900 border border-zinc-800" : "bg-white"
            )}>
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
                    <Volume2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-white">Voice Settings</h3>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Browser Text-to-Speech</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    setShowTtsSettings(false);
                  }} 
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
                    Speaking Speed ({settings.ttsSpeed}x)
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={settings.ttsSpeed}
                    onChange={(e) => updateSettings({ ttsSpeed: parseFloat(e.target.value) })}
                    className="w-full accent-purple-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      Select Voice
                    </label>
                    <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-bold">
                      Book Lang: {book.language || 'Auto'}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Suggested Voices */}
                    {availableVoices.filter(v => {
                      const bookLang = (book.language || '').toLowerCase();
                      if (bookLang.includes('hebrew')) return v.lang.startsWith('he');
                      if (bookLang.includes('english')) return v.lang.startsWith('en');
                      if (bookLang.includes('spanish')) return v.lang.startsWith('es');
                      if (bookLang.includes('french')) return v.lang.startsWith('fr');
                      return false;
                    }).length > 0 && (
                      <div className="mb-4">
                        <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2 px-1">Suggested for this book</p>
                        <div className="space-y-1">
                          {availableVoices.filter(v => {
                            const bookLang = (book.language || '').toLowerCase();
                            if (bookLang.includes('hebrew')) return v.lang.startsWith('he');
                            if (bookLang.includes('english')) return v.lang.startsWith('en');
                            if (bookLang.includes('spanish')) return v.lang.startsWith('es');
                            if (bookLang.includes('french')) return v.lang.startsWith('fr');
                            return false;
                          }).map(voice => (
                            <div 
                              key={voice.name}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border group",
                                (book.ttsVoice === voice.name || (!book.ttsVoice && settings.ttsVoice === voice.name))
                                  ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" 
                                  : "bg-white dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700 hover:border-zinc-200"
                              )}
                              onClick={() => {
                                updateBook(book.id, { ttsVoice: voice.name });
                                setBook({ ...book, ttsVoice: voice.name });
                              }}
                            >
                              <div className="min-w-0">
                                <p className={cn(
                                  "text-sm font-semibold truncate",
                                  (book.ttsVoice === voice.name || (!book.ttsVoice && settings.ttsVoice === voice.name)) ? "text-purple-700 dark:text-purple-300" : "text-zinc-700 dark:text-zinc-300"
                                )}>{voice.name}</p>
                                <p className="text-[10px] text-zinc-400">{voice.lang}</p>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.speechSynthesis.cancel();
                                  const samples: Record<string, string> = {
                                    'he': 'שלום, זהו קול הבדיקה שלי.',
                                    'en': 'Hello, this is my test voice.',
                                    'es': 'Hola, esta es mi voz de prueba.',
                                    'fr': 'Bonjour, c\'est ma voix de test.',
                                  };
                                  const langPrefix = voice.lang.split('-')[0].toLowerCase();
                                  const text = samples[langPrefix] || samples['en'];
                                  const utterance = new SpeechSynthesisUtterance(text);
                                  utterance.voice = voice;
                                  utterance.rate = settings.ttsSpeed;
                                  window.speechSynthesis.speak(utterance);
                                }}
                                className="p-2 hover:bg-purple-100 dark:hover:bg-purple-800 rounded-full text-purple-600 transition-colors"
                                title="Preview Voice"
                              >
                                <Play size={14} fill="currentColor" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2 px-1">All available voices</p>
                    <div className="space-y-1">
                      {availableVoices.map(voice => (
                        <div 
                          key={voice.name}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border group",
                            (book.ttsVoice === voice.name || (!book.ttsVoice && settings.ttsVoice === voice.name))
                              ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" 
                              : "bg-white dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700 hover:border-zinc-200"
                          )}
                          onClick={() => {
                            updateBook(book.id, { ttsVoice: voice.name });
                            setBook({ ...book, ttsVoice: voice.name });
                          }}
                        >
                          <div className="min-w-0">
                            <p className={cn(
                              "text-sm font-semibold truncate",
                              (book.ttsVoice === voice.name || (!book.ttsVoice && settings.ttsVoice === voice.name)) ? "text-purple-700 dark:text-purple-300" : "text-zinc-700 dark:text-zinc-300"
                            )}>{voice.name}</p>
                            <p className="text-[10px] text-zinc-400">{voice.lang}</p>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              window.speechSynthesis.cancel();
                              const samples: Record<string, string> = {
                                'he': 'שלום, זהו קול הבדיקה שלי.',
                                'en': 'Hello, this is my test voice.',
                                'es': 'Hola, esta es mi voz de prueba.',
                                'fr': 'Bonjour, c\'est ma voix de test.',
                              };
                              const langPrefix = voice.lang.split('-')[0].toLowerCase();
                              const text = samples[langPrefix] || samples['en'];
                              const utterance = new SpeechSynthesisUtterance(text);
                              utterance.voice = voice;
                              utterance.rate = settings.ttsSpeed;
                              window.speechSynthesis.speak(utterance);
                            }}
                            className="p-2 hover:bg-purple-100 dark:hover:bg-purple-800 rounded-full text-purple-600 transition-colors"
                            title="Preview Voice"
                          >
                            <Play size={14} fill="currentColor" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                <Button 
                  onClick={() => setShowTtsSettings(false)} 
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl h-12 font-bold"
                >
                  Apply Settings
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* AI Modal Overlay */}
        {aiResult.type && (
          <div className="fixed top-20 right-4 md:right-8 w-[calc(100%-2rem)] md:w-80 bg-white rounded-2xl shadow-xl border border-zinc-200 p-5 z-50 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2 text-zinc-900 font-medium">
                {aiResult.type === 'def' ? <Search size={16} className="text-blue-500" /> : <Languages size={16} className="text-emerald-500" />}
                {aiResult.type === 'def' ? 'Definition' : 'Translation'}
              </div>
              <button onClick={() => setAiResult({ type: null, content: '' })} className="text-zinc-400 hover:text-zinc-900 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="text-sm font-medium text-zinc-700 mb-2 border-l-2 border-zinc-200 pl-2 italic">
              "{selectedText}"
            </div>
            <div className="text-sm text-zinc-600 leading-relaxed max-h-[40vh] overflow-y-auto">
              {isAiLoading ? (
                <span className="flex items-center gap-2 text-zinc-400">
                  <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                  Analyzing...
                </span>
              ) : (
                aiResult.content
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 backdrop-blur-md border p-1.5 md:p-2 rounded-full shadow-lg transition-all duration-300 z-50 w-[95%] max-w-2xl",
        isImmersive ? "translate-y-24 opacity-0 hover:opacity-100 hover:translate-y-0" : "",
        settings.theme === 'dark' ? "bg-zinc-900/90 border-zinc-800" : "bg-white/90 border-zinc-200/50"
      )}>
        <div className="flex items-center justify-between gap-1 md:gap-4 px-1 md:px-2">
          
          {/* Progress */}
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <span className={cn("text-[9px] md:text-xs font-medium w-8 md:w-10 text-right shrink-0", settings.theme === 'dark' ? "text-zinc-400" : "text-zinc-500")}>
              {currentPage + 1}/{pages.length}
            </span>
            <div className={cn("flex-1 h-1 rounded-full overflow-hidden hidden xs:block", settings.theme === 'dark' ? "bg-zinc-800" : "bg-zinc-200/50")}>
              <div 
                className={cn("h-full rounded-full transition-all duration-300", settings.theme === 'dark' ? "bg-zinc-400" : "bg-zinc-900")}
                style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
              />
            </div>
          </div>

          {/* API Counter */}
          <div className={cn("hidden sm:flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md shrink-0 border", settings.theme === 'dark' ? "text-zinc-400 bg-zinc-800 border-zinc-700" : "text-zinc-500 bg-zinc-100 border-zinc-200/50")} title="Gemini API Calls">
            <Zap size={10} className="text-yellow-500" />
            <span>{apiCallCount}</span>
          </div>

          {/* TTS Controls */}
          <div className="flex items-center justify-center gap-0.5 md:gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => handleTextSelection('quote')} title="Save Quote" className={cn("hidden sm:inline-flex h-7 w-7 rounded-full", settings.theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "")}>
              <Highlighter size={14} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleTextSelection('def')} title="Define selected text" className={cn("hidden sm:inline-flex h-7 w-7 rounded-full", settings.theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "")}>
              <Search size={14} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                const selection = window.getSelection();
                if (selection && selection.toString().trim() !== '') {
                  handleTextSelection('trans');
                } else {
                  setIsTranslationModeActive(!isTranslationModeActive);
                }
              }} 
              title={isTranslationModeActive ? "Disable Tap to Translate" : "Enable Tap to Translate"} 
              className={cn(
                "h-7 w-7 rounded-full", 
                isTranslationModeActive ? (settings.theme === 'dark' ? "text-blue-400 bg-blue-900/30" : "text-blue-500 bg-blue-50") : (settings.theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "")
              )}
            >
              <Languages size={14} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              disabled={!isPlaying}
              onClick={() => {
                if (!book) return;
                const newValue = !effectiveIsSubtitleTranslationEnabled;
                const updatedBook = { ...book, isSubtitleTranslationEnabled: newValue };
                setBook(updatedBook);
                updateBook(book.id, { isSubtitleTranslationEnabled: newValue });
                db.saveBook(updatedBook);
              }} 
              title={!isPlaying ? "Start playback to enable subtitles" : `Toggle ${effectiveSubtitleLanguage} Subtitles`} 
              className={cn(
                "h-7 w-7 rounded-full transition-opacity", 
                !isPlaying && "opacity-30 grayscale cursor-not-allowed",
                effectiveIsSubtitleTranslationEnabled && isPlaying ? (settings.theme === 'dark' ? "text-blue-400 bg-blue-900/30" : "text-blue-500 bg-blue-50") : (settings.theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "")
              )}
            >
              <Captions size={14} />
            </Button>
            
            <div className={cn("w-px h-4 mx-0.5 md:mx-1", settings.theme === 'dark' ? "bg-zinc-700" : "bg-zinc-300")} />

            <Button variant="ghost" size="icon" onClick={handlePrevPage} className={cn("h-7 w-7 rounded-full", settings.theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "")}>
              <SkipBack size={14} />
            </Button>
            <Button 
              variant="primary" 
              size="icon" 
              className="rounded-full w-8 h-8 md:w-9 md:h-9 shadow-sm shrink-0"
              onClick={toggleTTS}
            >
              {isTtsLoading || isDramatizing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause size={16} className="fill-current" />
              ) : (
                <Play size={16} className="fill-current ml-0.5" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNextPage} className={cn("h-7 w-7 rounded-full", settings.theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "")}>
              <SkipForward size={14} />
            </Button>
          </div>

          {/* Exit Immersive */}
          <div className="flex-1 flex justify-end min-w-0">
            {isImmersive && (
              <Button variant="outline" size="sm" onClick={() => setIsImmersive(false)} className={cn("text-[10px] h-7 px-2 rounded-full", settings.theme === 'dark' ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "")}>
                Exit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
