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
  addedAt: number;
  isArchived?: boolean;
  language?: string;
  analysis?: {
    summary: string;
    characters: any[];
    themes: string[];
    glossary: any[];
  };
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
