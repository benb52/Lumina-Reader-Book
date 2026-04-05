import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  uid: string;
  email: string;
  name: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  content: string; // Full text with markers
  totalPages: number;
  lastReadPage: number;
  lastReadSentenceIndex?: number;
  addedAt: number;
  isArchived?: boolean;
  language?: string;
  textDirection?: 'ltr' | 'rtl';
  coverUrl?: string;
  analysis?: {
    summary: string;
    characters: any[];
    themes: string[];
    glossary: any[];
  };
  dramatization?: {
    pages: {
      [pageIndex: number]: {
        segments: {
          text: string;
          speaker: string;
          voice: string;
        }[];
      };
    };
    speakerVoices: { [speakerName: string]: string };
    speakerGenders?: { [speakerName: string]: 'male' | 'female' | 'neutral' };
  };
}

export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  context: string;
  bookId: string;
  addedAt: number;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  date: number;
  pagesRead: number;
  durationSeconds: number;
  language: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  fontSize: number;
  fontFamily: string;
  ttsSpeed: number;
  ttsVoice: string;
  dailyGoalPages: number;
  apiKey: string;
  highlightStyle: 'yellow-bg' | 'underline' | 'bold' | 'text-blue';
  ttsProvider: 'browser' | 'gemini';
  geminiVoice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede';
  subtitleLanguage: string;
  autoTurnPage: boolean;
  isSubtitleTranslationEnabled: boolean;
  statisticsTimeframe: 'day' | 'week' | 'month' | 'year' | 'all';
  highlightSavedQuotes: boolean;
  aiChunkSizeMultiplier: number;
  aiLanguage: 'he' | 'en' | 'es';
  isDramatizedReadingEnabled: boolean;
}

interface AppState {
  user: User | null;
  books: Book[];
  settings: AppSettings;
  login: (user: User) => void;
  logout: () => void;
  addBook: (book: Book) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  apiCallCount: number;
  incrementApiCallCount: () => void;
  isWaitingForQuota: boolean;
  setIsWaitingForQuota: (val: boolean) => void;
  vocabulary: VocabularyWord[];
  setVocabulary: (words: VocabularyWord[]) => void;
  addVocabularyWord: (word: VocabularyWord) => void;
  removeVocabularyWord: (id: string) => void;
  readingSessions: ReadingSession[];
  addReadingSession: (session: ReadingSession) => void;
  setReadingSessions: (sessions: ReadingSession[]) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      books: [],
      settings: {
        theme: 'light',
        fontSize: 18,
        fontFamily: 'serif',
        ttsSpeed: 1.0,
        ttsVoice: 'Google US English',
        dailyGoalPages: 30,
        apiKey: '',
        highlightStyle: 'yellow-bg',
        ttsProvider: 'browser',
        geminiVoice: 'Kore',
        subtitleLanguage: 'Hebrew',
        autoTurnPage: false,
        isSubtitleTranslationEnabled: false,
        statisticsTimeframe: 'all',
        highlightSavedQuotes: true,
        aiChunkSizeMultiplier: 1,
        aiLanguage: 'he',
        isDramatizedReadingEnabled: false,
      },
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      addBook: (book) => set((state) => ({ books: [...state.books, book] })),
      updateBook: (id, updates) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),
      deleteBook: (id) =>
        set((state) => ({ books: state.books.filter((b) => b.id !== id) })),
      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),
      apiCallCount: 0,
      incrementApiCallCount: () => set((state) => ({ apiCallCount: state.apiCallCount + 1 })),
      isWaitingForQuota: false,
      setIsWaitingForQuota: (val) => set({ isWaitingForQuota: val }),
      vocabulary: [],
      setVocabulary: (words) => set({ vocabulary: words }),
      addVocabularyWord: (word) => set((state) => ({ vocabulary: [word, ...state.vocabulary] })),
      removeVocabularyWord: (id) => set((state) => ({ vocabulary: state.vocabulary.filter(w => w.id !== id) })),
      readingSessions: [],
      addReadingSession: (session) => set((state) => ({ readingSessions: [...state.readingSessions, session] })),
      setReadingSessions: (sessions) => set({ readingSessions: sessions }),
    }),
    {
      name: 'lumina-storage',
      partialize: (state) => ({
        user: state.user,
        settings: state.settings,
        // Don't persist books in localStorage, they can be too large.
        // We will use IndexedDB for books.
      }),
    }
  )
);

export const appStore = useStore;
