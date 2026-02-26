import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Settings as SettingsIcon, X, BookOpen, Languages, Search, ChevronLeft, ChevronRight, MessageSquare, Zap, Highlighter, Captions, Sparkles } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';
import QuotesPanel from '../components/QuotesPanel';
import XRayPanel from '../components/XRayPanel';
import { getDefinition, translateText, generateSpeech, translateSentencesBatch, analyzeBookWithAI } from '../services/ai';
import { cn } from '../lib/utils';

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

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < wavBytes.length; i += chunkSize) {
    const chunk = wavBytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const getSentences = (text: string) => {
  if (!text) return [];
  return text.split(/(?<=[.!?\n])\s+/).filter(s => s.trim().length > 0);
};

export default function BookReader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [showXRay, setShowXRay] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isAnalyzingSummary, setIsAnalyzingSummary] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  
  const [selectedText, setSelectedText] = useState('');
  const [aiResult, setAiResult] = useState<{ type: 'def' | 'trans' | null, content: string }>({ type: null, content: '' });
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [pageTranslations, setPageTranslations] = useState<string[]>([]);
  const [isTranslatingSubtitle, setIsTranslatingSubtitle] = useState(false);
  const [isSubtitleTranslationEnabled, setIsSubtitleTranslationEnabled] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [geminiAudioData, setGeminiAudioData] = useState<{ url: string, sentences: string[] } | null>(null);

  const settings = useStore((state) => state.settings);
  const updateBook = useStore((state) => state.updateBook);
  const apiKey = settings.apiKey;

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Refs to fix closure issues in async recursive functions
  const settingsRef = useRef(settings);
  const isSubtitleTranslationEnabledRef = useRef(isSubtitleTranslationEnabled);
  const apiKeyRef = useRef(apiKey);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    settingsRef.current = settings;
    isSubtitleTranslationEnabledRef.current = isSubtitleTranslationEnabled;
    apiKeyRef.current = apiKey;
    isPlayingRef.current = isPlaying;
  }, [settings, isSubtitleTranslationEnabled, apiKey, isPlaying]);

  useEffect(() => {
    if (id) {
      loadBook(id);
    }
    synthRef.current = window.speechSynthesis;
    audioRef.current = new Audio();
    return () => {
      if (synthRef.current) synthRef.current.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [id]);

  // Auto-scroll to highlighted sentence
  useEffect(() => {
    if (isPlaying && currentSentenceIndex !== null && contentRef.current) {
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
  }, [currentSentenceIndex, isPlaying]);

  const loadBook = async (bookId: string) => {
    const b = await db.getBook(bookId);
    if (b) {
      setBook(b);
      // Split content by our marker
      const pgs = b.content.split('<<LUMINA_PAGE_BREAK>>').filter(p => p.trim() !== '');
      setPages(pgs);
      setCurrentPage(Math.max(0, b.lastReadPage - 1));
      
      // Load quotes
      const savedQuotes = await db.getQuotes(bookId);
      if (savedQuotes) setQuotes(savedQuotes);
    } else {
      navigate('/');
    }
  };

  const saveProgress = async (pageIndex: number) => {
    if (book) {
      const updatedBook = { ...book, lastReadPage: pageIndex + 1 };
      await db.saveBook(updatedBook);
      updateBook(book.id, { lastReadPage: pageIndex + 1 });
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
        const result = await analyzeBookWithAI(book!.content, apiKey);
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

  const handleNextPage = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(prev => {
        const next = prev + 1;
        saveProgress(next);
        return next;
      });
      if (isPlaying) stopTTS();
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => {
        const next = prev - 1;
        saveProgress(next);
        return next;
      });
      if (isPlaying) stopTTS();
    }
  };

  const toggleTTS = () => {
    if (isPlaying || isTtsLoading) {
      if (settings.ttsProvider === 'gemini' && audioRef.current) {
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
      if (settings.ttsProvider === 'gemini' && audioRef.current && audioRef.current.src && !audioRef.current.ended && audioRef.current.currentTime > 0) {
        audioRef.current.play().catch(() => startTTS(currentSentenceIndex !== null ? currentSentenceIndex : 0));
      } else if (settings.ttsProvider === 'browser' && synthRef.current && synthRef.current.paused) {
        synthRef.current.resume();
      } else {
        startTTS(currentSentenceIndex !== null ? currentSentenceIndex : 0);
      }
    }
  };

  // Fetch translations for the whole page when page changes or subtitles are enabled
  useEffect(() => {
    if (!isSubtitleTranslationEnabled || !apiKey) {
      setPageTranslations([]);
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

    setIsTranslatingSubtitle(true);
    translateSentencesBatch(sentences, settings.subtitleLanguage, apiKey)
      .then(translated => {
        setPageTranslations(translated);
      })
      .catch(err => {
        console.error("Batch translation error", err);
        setPageTranslations([]);
      })
      .finally(() => {
        setIsTranslatingSubtitle(false);
      });
  }, [currentPage, isSubtitleTranslationEnabled, apiKey, settings.subtitleLanguage, pages]);

  // Update current subtitle based on sentence index
  useEffect(() => {
    if (!isSubtitleTranslationEnabled || !isPlaying || currentSentenceIndex === null) {
      setCurrentSubtitle('');
      return;
    }

    if (pageTranslations && pageTranslations.length > currentSentenceIndex && pageTranslations[currentSentenceIndex]) {
      setCurrentSubtitle(pageTranslations[currentSentenceIndex]);
    } else {
      // Fallback if translation isn't ready or failed
      const cleanText = pages[currentPage]
        ?.replace(/<<PAGE:\d+>>/g, '')
        .replace(/<<BOLD_START>>/g, '')
        .replace(/<<BOLD_END>>/g, '')
        .replace(/<<UNDERLINE_START>>/g, '')
        .replace(/<<UNDERLINE_END>>/g, '');
      const sentences = getSentences(cleanText || '');
      setCurrentSubtitle(sentences[currentSentenceIndex] || '');
    }
  }, [currentSentenceIndex, isPlaying, isSubtitleTranslationEnabled, pageTranslations, currentPage, pages]);

  const startTTS = async (startIndex = 0) => {
    if (!pages[currentPage]) return;
    
    if (settingsRef.current.ttsProvider === 'browser' && synthRef.current) {
      synthRef.current.cancel();
    }
    if (settingsRef.current.ttsProvider === 'gemini' && audioRef.current) {
      audioRef.current.pause();
    }
    
    // Clean up markers for reading
    const cleanText = pages[currentPage]
      .replace(/<<PAGE:\d+>>/g, '')
      .replace(/<<BOLD_START>>/g, '')
      .replace(/<<BOLD_END>>/g, '')
      .replace(/<<UNDERLINE_START>>/g, '')
      .replace(/<<UNDERLINE_END>>/g, '');

    const sentences = getSentences(cleanText);

    setIsPlaying(true);
    setIsTtsLoading(true);
    isPlayingRef.current = true;

    if (settingsRef.current.ttsProvider === 'gemini') {
      if (!apiKeyRef.current) {
        setErrorMessage('Gemini API Key is required for high-quality TTS. Falling back to browser TTS.');
        setIsTtsLoading(false);
        playWithBrowserTTS(sentences, startIndex);
        return;
      }
      playWithGeminiTTS(sentences, startIndex);
    } else {
      // Browser TTS
      playWithBrowserTTS(sentences, startIndex);
    }
  };

  const playWithGeminiTTS = (sentences: string[], startIdx: number) => {
    let currentIdx = startIdx;
    let nextAudioBase64: string | null = null;
    let isRateLimited = false;

    const fetchAudio = async (idx: number) => {
      if (idx >= sentences.length || isRateLimited) return null;
      try {
        return await generateSpeech(sentences[idx].trim(), settingsRef.current.geminiVoice, apiKeyRef.current);
      } catch (e: any) {
        console.error("Failed to fetch audio", e);
        const errStr = e ? (e.message || e.toString() || JSON.stringify(e)) : '';
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
           isRateLimited = true;
           setErrorMessage("Gemini API rate limit exceeded (15 requests/min on free tier). Falling back to browser voice.");
        }
        return null;
      }
    };

    const playNext = async () => {
      if (!isPlayingRef.current) return;
      
      if (currentIdx >= sentences.length) {
        setIsPlaying(false);
        setCurrentSubtitle('');
        setCurrentSentenceIndex(null);
        if (settingsRef.current.autoTurnPage && currentPage < pages.length - 1) {
            handleNextPage();
            setTimeout(() => {
              startTTS(0);
            }, 500);
        }
        return;
      }

      const sentence = sentences[currentIdx].trim();
      if (!sentence) {
        currentIdx++;
        playNext();
        return;
      }

      let base64Audio = nextAudioBase64;
      if (!base64Audio) {
        setIsTtsLoading(true);
        base64Audio = await fetchAudio(currentIdx);
        setIsTtsLoading(false);
      }
      
      // Start fetching next audio in background if not rate limited
      nextAudioBase64 = null;
      if (currentIdx + 1 < sentences.length && !isRateLimited) {
        fetchAudio(currentIdx + 1).then(audio => {
          nextAudioBase64 = audio;
        });
      }

      if (!isPlayingRef.current) return;

      // UPDATE INDEX HERE, right before playing so highlight syncs perfectly
      setCurrentSentenceIndex(currentIdx);

      if (base64Audio && audioRef.current) {
        const wavUrl = pcmBase64ToWavBase64(base64Audio, 24000);
        audioRef.current.src = wavUrl;
        audioRef.current.playbackRate = settingsRef.current.ttsSpeed;
        
        audioRef.current.onended = () => {
          if (!isPlayingRef.current) return;
          currentIdx++;
          playNext();
        };
        
        audioRef.current.play().catch(e => {
          console.error('Audio play error:', e);
          currentIdx++;
          playNext();
        });
      } else {
        // Fallback to browser TTS for this sentence if Gemini fails
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.rate = settingsRef.current.ttsSpeed;
        utterance.onend = () => {
          if (!isPlayingRef.current) return;
          currentIdx++;
          playNext();
        };
        synthRef.current?.speak(utterance);
      }
    };

    playNext();
  };

  const playWithBrowserTTS = (sentences: string[], startIdx: number) => {
    let currentIdx = startIdx;

    const playNext = async () => {
      if (!isPlayingRef.current) return;
      
      if (currentIdx >= sentences.length) {
        setIsPlaying(false);
        setCurrentSubtitle('');
        setCurrentSentenceIndex(null);
        return;
      }

      const sentence = sentences[currentIdx].trim();
      if (!sentence) {
        currentIdx++;
        playNext();
        return;
      }

      setCurrentSentenceIndex(currentIdx);

      if (!isPlayingRef.current) return;

      setIsTtsLoading(false);
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = settingsRef.current.ttsSpeed;
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
        if (currentIdx >= sentences.length && settingsRef.current.autoTurnPage && currentPage < pages.length - 1) {
            handleNextPage();
            setTimeout(() => {
              startTTS(0);
            }, 500);
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
    setCurrentSentenceIndex(null);
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
        const trans = await translateText(text, settings.subtitleLanguage, apiKey);
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
    const getHighlightClass = () => {
      switch (settings.highlightStyle) {
        case 'underline': return 'underline decoration-yellow-400 decoration-2 underline-offset-4';
        case 'bold': return 'font-bold text-zinc-900';
        case 'text-blue': return 'text-blue-600 font-medium';
        case 'yellow-bg':
        default: return 'bg-yellow-200 text-black rounded px-1 py-0.5';
      }
    };

    const renderRawText = (raw: string, initialBold: boolean, initialUnderline: boolean) => {
      const parts = raw.split(/(<<BOLD_START>>|<<BOLD_END>>|<<UNDERLINE_START>>|<<UNDERLINE_END>>|<<PAGE:\d+>>|\n)/g);
      let isBold = initialBold;
      let isUnderline = initialUnderline;
      
      const nodes = parts.map((part, i) => {
        if (!part) return null;
        if (part === '<<BOLD_START>>') { isBold = true; return null; }
        if (part === '<<BOLD_END>>') { isBold = false; return null; }
        if (part === '<<UNDERLINE_START>>') { isUnderline = true; return null; }
        if (part === '<<UNDERLINE_END>>') { isUnderline = false; return null; }
        if (part.startsWith('<<PAGE:')) return null;
        if (part === '\n') return <br key={i} />;
        
        let className = '';
        if (isBold) className += 'font-bold text-zinc-900 ';
        if (isUnderline) className += 'underline decoration-zinc-400 underline-offset-4 ';

        return className ? <span key={i} className={className.trim()}>{part}</span> : <span key={i}>{part}</span>;
      });
      
      return { nodes, finalBold: isBold, finalUnderline: isUnderline };
    };

    if (!isPlaying || currentSentenceIndex === null) {
      return renderRawText(text, false, false).nodes;
    }

    // 1. Build clean text and a mapping from clean index to raw index
    let cleanText = '';
    const cleanToRaw: number[] = [];
    
    const markerRegex = /(<<BOLD_START>>|<<BOLD_END>>|<<UNDERLINE_START>>|<<UNDERLINE_END>>|<<PAGE:\d+>>)/g;
    let rawIdx = 0;
    let match;
    
    while ((match = markerRegex.exec(text)) !== null) {
      const before = text.substring(rawIdx, match.index);
      for (let i = 0; i < before.length; i++) {
        cleanText += before[i];
        cleanToRaw.push(rawIdx + i);
      }
      rawIdx = markerRegex.lastIndex;
    }
    const remaining = text.substring(rawIdx);
    for (let i = 0; i < remaining.length; i++) {
      cleanText += remaining[i];
      cleanToRaw.push(rawIdx + i);
    }
    
    // 2. Find sentence boundaries in clean text
    const sentences = getSentences(cleanText);
    const currentSentence = sentences[currentSentenceIndex];
    
    if (!currentSentence) return renderRawText(text, false, false).nodes;

    let searchIdx = 0;
    for (let i = 0; i < currentSentenceIndex; i++) {
      const prevSentence = sentences[i];
      const idx = cleanText.indexOf(prevSentence, searchIdx);
      if (idx !== -1) {
        searchIdx = idx + prevSentence.length;
      }
    }

    let startCleanIdx = cleanText.indexOf(currentSentence, searchIdx);
    if (startCleanIdx === -1) return renderRawText(text, false, false).nodes;
    
    let endCleanIdx = startCleanIdx + currentSentence.length;

    // 3. Map clean indices back to raw indices
    const startRawIdx = cleanToRaw[startCleanIdx];
    const endRawIdx = endCleanIdx < cleanToRaw.length ? cleanToRaw[endCleanIdx] : text.length;
    
    // 4. Split raw text into 3 parts
    const beforeRaw = text.substring(0, startRawIdx);
    const highlightRaw = text.substring(startRawIdx, endRawIdx);
    const afterRaw = text.substring(endRawIdx);
    
    const beforeRender = renderRawText(beforeRaw, false, false);
    const highlightRender = renderRawText(highlightRaw, beforeRender.finalBold, beforeRender.finalUnderline);
    const afterRender = renderRawText(afterRaw, highlightRender.finalBold, highlightRender.finalUnderline);
    
    return (
      <>
        {beforeRender.nodes}
        <span className={cn("transition-colors duration-200", getHighlightClass())} data-highlighted="true">
          {highlightRender.nodes}
        </span>
        {afterRender.nodes}
      </>
    );
  };

  return (
    <div className={cn(
      "flex flex-col h-full transition-all duration-300 relative",
      isImmersive ? "bg-[#f5f5f0]" : "bg-zinc-50"
    )}>
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
        <header className="flex items-center justify-between p-4 bg-white border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ChevronLeft size={20} />
            </Button>
            <div>
              <h1 className="font-semibold text-zinc-900 leading-tight">{book.title}</h1>
              <p className="text-xs text-zinc-500">{book.author}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleAnalyzeSummary} title="AI Summary">
              <Sparkles size={20} className={showSummary ? "text-purple-500" : "text-zinc-400"} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setShowXRay(!showXRay); setShowQuotes(false); setShowSummary(false); }} title="X-Ray">
              <Zap size={20} className={showXRay ? "text-yellow-500" : "text-zinc-400"} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setShowQuotes(!showQuotes); setShowXRay(false); setShowSummary(false); }} title="Quotes">
              <MessageSquare size={20} className={showQuotes ? "text-blue-500" : "text-zinc-400"} />
            </Button>
            <div className="w-px h-6 bg-zinc-200 mx-2" />
            <Button variant="ghost" size="icon" onClick={() => setIsImmersive(true)} title="Immersive Mode">
              <BookOpen size={20} />
            </Button>
          </div>
        </header>
      )}

      {/* Main Reader Area */}
      <div className="flex-1 overflow-hidden relative flex">
        
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
            "flex-1 overflow-y-auto px-4 py-6 md:px-12 lg:px-24 scroll-smooth",
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
          <div 
            className={cn(
              "max-w-4xl mx-auto prose prose-zinc",
              settings.fontFamily === 'serif' ? 'font-serif' : settings.fontFamily === 'mono' ? 'font-mono' : 'font-sans'
            )}
            style={{ fontSize: `${settings.fontSize}px`, lineHeight: 1.8 }}
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
            data={book.analysis as any} 
            onClose={() => setShowXRay(false)} 
          />
        )}
        {showSummary && (
          <div className="w-80 bg-white border-l border-zinc-200 shadow-xl flex flex-col h-full z-20 shrink-0 animate-in slide-in-from-right-8">
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2 text-zinc-900 font-medium">
                <Sparkles size={18} className="text-purple-500" />
                AI Summary
              </div>
              <button onClick={() => setShowSummary(false)} className="text-zinc-400 hover:text-zinc-900 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isAnalyzingSummary ? (
                <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-3">
                  <div className="w-6 h-6 border-2 border-zinc-300 border-t-purple-500 rounded-full animate-spin" />
                  <p className="text-sm">Analyzing book content...</p>
                </div>
              ) : (
                <div className="prose prose-sm prose-zinc">
                  <p className="leading-relaxed text-zinc-700">{summaryText || book?.analysis?.summary}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subtitles Overlay */}
        {isPlaying && currentSubtitle && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-40 pointer-events-none">
            <div className="bg-black/80 backdrop-blur-md text-white px-6 py-4 rounded-2xl text-center shadow-2xl border border-white/10 mx-auto w-full max-h-[30vh] overflow-y-auto pointer-events-auto">
              {isTranslatingSubtitle ? (
                <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Translating...
                </div>
              ) : (
                <div className="text-lg md:text-xl font-medium leading-relaxed whitespace-pre-wrap" dir="auto" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  {currentSubtitle}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Modal Overlay */}
        {aiResult.type && (
          <div className="fixed top-20 right-4 md:right-8 w-80 bg-white rounded-2xl shadow-xl border border-zinc-200 p-5 z-50 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2 text-zinc-900 font-medium">
                {aiResult.type === 'def' ? <Search size={16} className="text-blue-500" /> : <Languages size={16} className="text-emerald-500" />}
                {aiResult.type === 'def' ? 'Definition' : 'Translation'}
              </div>
              <button onClick={() => setAiResult({ type: null, content: '' })} className="text-zinc-400 hover:text-zinc-900">
                <X size={16} />
              </button>
            </div>
            <div className="text-sm font-medium text-zinc-700 mb-2 border-l-2 border-zinc-200 pl-2">
              "{selectedText}"
            </div>
            <div className="text-sm text-zinc-600 leading-relaxed">
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
        "fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-zinc-200/50 p-2 rounded-full shadow-lg transition-all duration-300 z-50 w-[95%] max-w-2xl",
        isImmersive ? "translate-y-24 opacity-0 hover:opacity-100 hover:translate-y-0" : ""
      )}>
        <div className="flex items-center justify-between gap-2 md:gap-4 px-2">
          
          {/* Progress */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-[10px] md:text-xs font-medium text-zinc-500 w-10 text-right shrink-0">
              {currentPage + 1}/{pages.length}
            </span>
            <div className="flex-1 h-1 bg-zinc-200/50 rounded-full overflow-hidden hidden sm:block">
              <div 
                className="h-full bg-zinc-900 rounded-full transition-all duration-300"
                style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
              />
            </div>
          </div>

          {/* TTS Controls */}
          <div className="flex items-center justify-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => handleTextSelection('quote')} title="Save Quote" className="hidden sm:inline-flex h-7 w-7 rounded-full">
              <Highlighter size={14} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleTextSelection('def')} title="Define selected text" className="hidden sm:inline-flex h-7 w-7 rounded-full">
              <Search size={14} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleTextSelection('trans')} title="Translate selected text" className="h-7 w-7 rounded-full">
              <Languages size={14} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSubtitleTranslationEnabled(!isSubtitleTranslationEnabled)} 
              title={`Toggle ${settings.subtitleLanguage} Subtitles`} 
              className={cn("h-7 w-7 rounded-full", isSubtitleTranslationEnabled ? "text-blue-500 bg-blue-50" : "")}
            >
              <Captions size={14} />
            </Button>
            
            <div className="w-px h-4 bg-zinc-300 mx-1" />

            <Button variant="ghost" size="icon" onClick={handlePrevPage} className="h-7 w-7 rounded-full">
              <SkipBack size={14} />
            </Button>
            <Button 
              variant="primary" 
              size="icon" 
              className="rounded-full w-9 h-9 shadow-sm shrink-0"
              onClick={toggleTTS}
            >
              {isTtsLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause size={16} className="fill-current" />
              ) : (
                <Play size={16} className="fill-current ml-0.5" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNextPage} className="h-7 w-7 rounded-full">
              <SkipForward size={14} />
            </Button>
          </div>

          {/* Settings / Exit Immersive */}
          <div className="flex-1 flex justify-end min-w-0">
            {isImmersive ? (
              <Button variant="outline" size="sm" onClick={() => setIsImmersive(false)} className="text-[10px] h-7 px-2 rounded-full">
                Exit
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} className="h-7 w-7 rounded-full">
                <SettingsIcon size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
