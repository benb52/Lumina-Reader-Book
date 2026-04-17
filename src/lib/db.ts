import { get, set, del, keys } from 'idb-keyval';
import { Book, AppSettings, VocabularyWord, appStore } from '../store/useStore';
import { db as firestore, auth } from './firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, orderBy, increment, onSnapshot } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  if (errorMsg.toLowerCase().includes('offline') || errorMsg.toLowerCase().includes('unavailable')) {
    appStore.getState().setIsFirestoreOffline(true);
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Quote {
  id: string;
  text: string;
  color: string;
  page: number;
}

export const db = {
  async getUserMetadata(userId: string) {
    try {
      const docRef = doc(firestore, 'users', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Cannot get user metadata.");
        if (error.code === 'unavailable') appStore.getState().setIsFirestoreOffline(true);
      } else {
        console.error("Error getting user metadata:", error);
      }
      return null;
    }
  },

  async updateUserMetadata(user: { uid: string; email: string; name?: string; isAdmin?: boolean }) {
    try {
      const userRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      const updateData: any = {
        uid: user.uid,
        email: user.email,
        lastLogin: Date.now()
      };

      if (user.isAdmin) {
        updateData.isAdmin = true;
      }

      if (!userDoc.exists() || !userDoc.data().name) {
        updateData.name = user.name || user.email.split('@')[0];
      } else if (user.name && user.name !== user.email.split('@')[0]) {
         updateData.name = user.name;
      }

      await setDoc(userRef, updateData, { merge: true });
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Cannot update user metadata.");
      } else {
        console.error("Error updating user metadata:", error);
      }
    }
  },

  async getAllUsers() {
    try {
      const querySnapshot = await getDocs(collection(firestore, 'users'));
      const users: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Ensure uid is present, fallback to doc ID if missing
        users.push({
          uid: doc.id,
          ...data
        });
      });
      return users;
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
      console.error("Error getting all users:", error);
      throw error;
    }
  },

  async getUserBooksCount(userId: string) {
    try {
      const querySnapshot = await getDocs(collection(firestore, `users/${userId}/books`));
      return querySnapshot.size;
    } catch (error: any) {
      if (error.code !== 'permission-denied' && error.code !== 'unavailable') {
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

    // Ensure we have the latest book data including dramatization
    const latestBook = await this.getBook(book.id) || book;

    const shareId = `${senderId}_${book.id}_${Date.now()}`;
    
    const bookJson = JSON.stringify(latestBook);
    const CHUNK_SIZE = 800 * 1024; // 800KB chunks
    const isLarge = bookJson.length > CHUNK_SIZE;
    
    let sharedBookData: any = {
      id: shareId,
      senderId: senderId,
      senderEmail: senderEmail.toLowerCase(),
      senderName: auth.currentUser?.displayName || senderEmail.split('@')[0],
      targetEmail: targetEmail.toLowerCase(),
      sentAt: Date.now(),
      status: 'pending',
      isChunked: isLarge
    };

    if (isLarge) {
      // Store metadata for the list view
      sharedBookData.bookMetadata = {
        title: latestBook.title,
        author: latestBook.author,
        coverUrl: latestBook.coverUrl
      };
      
      // Save the main document first
      await setDoc(doc(firestore, 'shared_books', shareId), sharedBookData);
      
      // Split and save chunks
      const totalChunks = Math.ceil(bookJson.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = bookJson.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await setDoc(doc(firestore, `shared_books/${shareId}/chunks`, i.toString()), {
          index: i,
          data: chunk
        });
      }
    } else {
      sharedBookData.book = latestBook;
      await setDoc(doc(firestore, 'shared_books', shareId), sharedBookData);
    }
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
      console.error("Error fetching received books:", error);
      handleFirestoreError(error, OperationType.LIST, 'shared_books');
      return [];
    }
  },

  async getSharedBookChunks(shareId: string) {
    try {
      const q = query(
        collection(firestore, `shared_books/${shareId}/chunks`),
        orderBy('index', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const chunks: string[] = [];
      querySnapshot.forEach((doc) => {
        chunks.push(doc.data().data);
      });
      return chunks.join('');
    } catch (error) {
      console.error("Error getting shared book chunks:", error);
      throw error;
    }
  },

  async deleteReceivedBook(shareId: string) {
    try {
      // If it was chunked, we should ideally delete the sub-collection too
      // But Firestore doesn't support recursive delete easily from client
      // The main doc deletion is enough for the UI to hide it
      await deleteDoc(doc(firestore, 'shared_books', shareId));
    } catch (error: any) {
      if (error.code !== 'permission-denied' && error.code !== 'unavailable') {
        console.error("Error deleting received book:", error);
      }
      throw error;
    }
  },

  async saveBook(book: Book) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Save locally (IndexedDB has no 1MB limit)
    await set(`book-${userId}-${book.id}`, book);
    
    // Save to Firebase (Handle Firestore 1MB document limit)
    try {
      const bookJson = JSON.stringify(book);
      const CHUNK_SIZE = 800 * 1024; // 800KB chunks
      const isLarge = bookJson.length > CHUNK_SIZE;

      if (isLarge) {
        // Store skeleton metadata
        const skeleton = {
          ...book,
          content: '', // Clear large fields to stay under limit
          dramatization: { pages: {}, speakerVoices: book.dramatization?.speakerVoices || {} },
          isChunked: true,
          chunkCount: Math.ceil(bookJson.length / CHUNK_SIZE),
          lastUpdated: Date.now()
        };
        
        await setDoc(doc(firestore, `users/${userId}/books`, book.id), skeleton);
        
        // Split and save chunks in subcollection
        const totalChunks = skeleton.chunkCount;
        const chunkPromises = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunk = bookJson.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          chunkPromises.push(setDoc(doc(firestore, `users/${userId}/books/${book.id}/chunks`, i.toString()), {
            index: i,
            data: chunk
          }));
        }
        await Promise.all(chunkPromises);
      } else {
        await setDoc(doc(firestore, `users/${userId}/books`, book.id), { ...book, isChunked: false });
      }
      appStore.getState().setIsFirestoreOffline(false);
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Data saved locally only.");
        if (error.code === 'unavailable') appStore.getState().setIsFirestoreOffline(true);
      } else {
        console.error("Error saving to Firebase:", error);
      }
    }
  },

  async updateBookField(bookId: string, field: string, value: any) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Update locally first
    const book = await this.getBook(bookId);
    if (book) {
      const updatedBook = { ...book, [field]: value };
      await set(`book-${userId}-${bookId}`, updatedBook);
      
      // Use saveBook as it handles the document limit correctly
      await this.saveBook(updatedBook);
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
        const data = docSnap.data();
        if (data.isChunked) {
          // Fetch chunks
          const q = query(
            collection(firestore, `users/${userId}/books/${id}/chunks`),
            orderBy('index', 'asc')
          );
          const chunkSnap = await getDocs(q);
          const chunks: string[] = [];
          chunkSnap.forEach((c) => chunks.push(c.data().data));
          const fullJson = chunks.join('');
          book = JSON.parse(fullJson) as Book;
        } else {
          book = data as Book;
        }
        
        // Cache locally
        await set(`book-${userId}-${id}`, book);
        return book;
      }
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Using local data if available.");
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
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Data deleted locally only.");
      } else {
        console.error("Error deleting from Firebase:", error);
      }
    }
  },
  
  async getAllBooks(): Promise<Book[]> {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      console.warn("getAllBooks: No userId found");
      return [];
    }

    // Get local books
    const allKeys = await keys();
    const prefix = `book-${userId}-`;
    const bookKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
    const localBooks = await Promise.all(bookKeys.map((k) => get(k as string)));
    
    const booksMap = new Map<string, Book>();
    localBooks.filter(Boolean).forEach((b: any) => {
      booksMap.set(b.id, b);
    });
    
    // Try fetching from Firebase to sync
    try {
      const q = collection(firestore, `users/${userId}/books`);
      const querySnapshot = await getDocs(q);
      
      for (const docSnap of querySnapshot.docs) {
        const fbBook = docSnap.data() as Book;
        booksMap.set(fbBook.id, fbBook);
        // Update local cache
        await set(`book-${userId}-${fbBook.id}`, fbBook);
      }
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.LIST, `users/${userId}/books`);
      } else if (error.code === 'unavailable') {
        console.warn("Firebase offline. Using local data only.");
      } else {
        console.error("Error getting all books from Firebase:", error);
      }
    }
    
    return Array.from(booksMap.values());
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
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Quotes saved locally only.");
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
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Using local quotes if available.");
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
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Settings saved locally only.");
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
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Using local settings.");
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
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Vocabulary saved locally only.");
      } else {
        console.error("Error saving vocabulary word to Firebase:", error);
      }
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
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Using local vocabulary if available.");
      } else {
        console.error("Error getting vocabulary from Firebase:", error);
      }
      return [];
    }
  },

  async deleteVocabularyWord(id: string) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await deleteDoc(doc(firestore, `users/${userId}/vocabulary`, id));
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.code === 'unavailable') {
        console.warn("Firebase permission denied or offline. Vocabulary deleted locally only.");
      } else {
        console.error("Error deleting vocabulary word from Firebase:", error);
      }
    }
  },

  async updateUserAdminSettings(userId: string, settings: { managedApiKey?: string, apiKeyLimit?: number, isApiKeyManaged?: boolean }) {
    try {
      const userRef = doc(firestore, 'users', userId);
      await setDoc(userRef, settings, { merge: true });
    } catch (error) {
      console.error("Error updating user admin settings:", error);
      throw error;
    }
  },

  async incrementUserApiUsage(userId: string) {
    try {
      const userRef = doc(firestore, 'users', userId);
      await setDoc(userRef, { apiKeyUsage: increment(1) }, { merge: true });
    } catch (error) {
      console.error("Error incrementing user API usage:", error);
    }
  }
};
