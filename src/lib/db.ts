import { get, set, del, keys } from 'idb-keyval';
import { Book, AppSettings, VocabularyWord } from '../store/useStore';
import { db as firestore, auth } from './firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

export interface Quote {
  id: string;
  text: string;
  color: string;
  page: number;
}

export const db = {
  async updateUserMetadata(user: { uid: string; email: string; name: string }) {
    try {
      await setDoc(doc(firestore, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        name: user.name,
        lastLogin: Date.now()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating user metadata:", error);
    }
  },

  async getAllUsers() {
    try {
      const querySnapshot = await getDocs(collection(firestore, 'users'));
      const users: any[] = [];
      querySnapshot.forEach((doc) => {
        users.push(doc.data());
      });
      return users;
    } catch (error: any) {
      if (error.code !== 'permission-denied') {
        console.error("Error getting all users:", error);
      }
      throw error;
    }
  },

  async getUserBooksCount(userId: string) {
    try {
      const querySnapshot = await getDocs(collection(firestore, `users/${userId}/books`));
      return querySnapshot.size;
    } catch (error: any) {
      if (error.code !== 'permission-denied') {
        console.error("Error getting user books count:", error);
      }
      throw error;
    }
  },

  async shareBook(book: Book, targetEmail: string) {
    const senderId = auth.currentUser?.uid;
    const senderEmail = auth.currentUser?.email;
    if (!senderId || !senderEmail) throw new Error("Not authenticated");

    if (targetEmail.toLowerCase() === senderEmail.toLowerCase()) {
      throw new Error("You cannot share a book with yourself.");
    }

    const shareId = `${senderId}_${book.id}_${Date.now()}`;
    const sharedBookData = {
      id: shareId,
      book: book,
      senderId: senderId,
      senderEmail: senderEmail,
      senderName: auth.currentUser?.displayName || senderEmail.split('@')[0],
      targetEmail: targetEmail.toLowerCase(),
      sentAt: Date.now(),
      status: 'pending'
    };

    await setDoc(doc(firestore, 'shared_books', shareId), sharedBookData);
  },

  async getReceivedBooks() {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) return [];

    try {
      const q = query(collection(firestore, 'shared_books'), where('targetEmail', '==', userEmail.toLowerCase()));
      const querySnapshot = await getDocs(q);
      const receivedBooks: any[] = [];
      querySnapshot.forEach((doc) => {
        receivedBooks.push(doc.data());
      });
      return receivedBooks.sort((a, b) => b.sentAt - a.sentAt);
    } catch (error: any) {
      if (error.code !== 'permission-denied') {
        console.error("Error getting received books:", error);
      }
      throw error;
    }
  },

  async deleteReceivedBook(shareId: string) {
    try {
      await deleteDoc(doc(firestore, 'shared_books', shareId));
    } catch (error: any) {
      if (error.code !== 'permission-denied') {
        console.error("Error deleting received book:", error);
      }
      throw error;
    }
  },

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
  },

  async saveVocabularyWord(word: VocabularyWord) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(firestore, `users/${userId}/vocabulary`, word.id), word);
    } catch (error) {
      console.error("Error saving vocabulary word to Firebase:", error);
    }
  },

  async getVocabulary(): Promise<VocabularyWord[]> {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    try {
      const querySnapshot = await getDocs(collection(firestore, `users/${userId}/vocabulary`));
      const words: VocabularyWord[] = [];
      querySnapshot.forEach((doc) => {
        words.push(doc.data() as VocabularyWord);
      });
      return words.sort((a, b) => b.addedAt - a.addedAt);
    } catch (error) {
      console.error("Error getting vocabulary from Firebase:", error);
      return [];
    }
  },

  async deleteVocabularyWord(id: string) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await deleteDoc(doc(firestore, `users/${userId}/vocabulary`, id));
    } catch (error) {
      console.error("Error deleting vocabulary word from Firebase:", error);
    }
  }
};
