import { get, set, del, keys } from 'idb-keyval';
import { Book, AppSettings } from '../store/useStore';
import { db as firestore, auth } from './firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

export interface Quote {
  id: string;
  text: string;
  color: string;
  page: number;
}

export const db = {
  async saveBook(book: Book) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Save locally
    await set(`book-${userId}-${book.id}`, book);
    
    // Save to Firebase (Everything in Firestore now)
    try {
      await setDoc(doc(firestore, `users/${userId}/books`, book.id), book);
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Data saved locally only.");
      } else {
        console.error("Error saving to Firebase:", error);
      }
    }
  },
  
  async getBook(id: string): Promise<Book | undefined> {
    const userId = auth.currentUser?.uid;
    if (!userId) return undefined;

    // Try local first
    let book = await get(`book-${userId}-${id}`);
    
    // If local book exists and has content, return it
    if (book && book.content) {
      return book;
    }
    
    // Fallback to Firebase
    try {
      const docRef = doc(firestore, `users/${userId}/books`, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        book = docSnap.data() as Book;
        
        // Cache locally
        await set(`book-${userId}-${id}`, book);
        return book;
      }
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Using local data if available.");
      } else {
        console.error("Error getting from Firebase:", error);
      }
    }
    
    return book;
  },
  
  async deleteBook(id: string) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Delete locally
    await del(`book-${userId}-${id}`);
    
    // Delete from Firebase
    try {
      await deleteDoc(doc(firestore, `users/${userId}/books`, id));
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Data deleted locally only.");
      } else {
        console.error("Error deleting from Firebase:", error);
      }
    }
  },
  
  async getAllBooks(): Promise<Book[]> {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    // Get local books
    const allKeys = await keys();
    const prefix = `book-${userId}-`;
    const bookKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
    const localBooks = await Promise.all(bookKeys.map((k) => get(k as string)));
    let books = localBooks.filter(Boolean) as Book[];
    
    // If no local books, try fetching from Firebase
    if (books.length === 0) {
      try {
        const q = collection(firestore, `users/${userId}/books`);
        const querySnapshot = await getDocs(q);
        const firebaseBooks: Book[] = [];
        
        for (const docSnap of querySnapshot.docs) {
          firebaseBooks.push(docSnap.data() as Book);
        }
        
        books = firebaseBooks;
        
        // Cache locally
        for (const book of books) {
          await set(`book-${userId}-${book.id}`, book);
        }
      } catch (error: any) {
        if (error.code === 'permission-denied') {
          console.warn("Firebase permission denied. Using local data only.");
        } else {
          console.error("Error getting all books from Firebase:", error);
        }
      }
    }
    
    return books;
  },

  async saveQuotes(bookId: string, quotes: Quote[]) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Save locally
    await set(`quotes-${userId}-${bookId}`, quotes);

    // Save to Firebase
    try {
      await setDoc(doc(firestore, `users/${userId}/quotes`, bookId), { quotes });
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Quotes saved locally only.");
      } else {
        console.error("Error saving quotes to Firebase:", error);
      }
    }
  },

  async getQuotes(bookId: string): Promise<Quote[]> {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    // Try local first
    const localQuotes = await get(`quotes-${userId}-${bookId}`);
    if (localQuotes) return localQuotes;

    // Fallback to Firebase
    try {
      const docRef = doc(firestore, `users/${userId}/quotes`, bookId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const quotes = docSnap.data().quotes || [];
        await set(`quotes-${userId}-${bookId}`, quotes);
        return quotes;
      }
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Using local quotes if available.");
      } else {
        console.error("Error getting quotes from Firebase:", error);
      }
    }
    return [];
  },

  async saveSettings(settings: AppSettings) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(firestore, `users/${userId}/settings`, 'preferences'), settings);
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Settings saved locally only.");
      } else {
        console.error("Error saving settings to Firebase:", error);
      }
    }
  },

  async getSettings(): Promise<AppSettings | null> {
    const userId = auth.currentUser?.uid;
    if (!userId) return null;

    try {
      const docRef = doc(firestore, `users/${userId}/settings`, 'preferences');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as AppSettings;
      }
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        console.warn("Firebase permission denied. Using local settings.");
      } else {
        console.error("Error getting settings from Firebase:", error);
      }
    }
    return null;
  }
};
