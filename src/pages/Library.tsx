import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Plus, FileText, Upload, Trash2, Edit3, BookOpen, Archive, ArchiveRestore, Share2, Check, X, Captions, AlertCircle, RefreshCw } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';
import { parsePDF, parseTXT, parseDOCX } from '../services/pdf';
import { analyzeBookWithAI } from '../services/ai';
import { cn } from '../lib/utils';

export default function Library() {
  const navigate = useNavigate();
  const location = useLocation();
  const [books, setBooks] = useState<Book[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const [bookToShare, setBookToShare] = useState<Book | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [receivedBooks, setReceivedBooks] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const user = useStore((state) => state.user);
  const apiKey = useStore((state) => state.settings.apiKey);

  // Paste Text state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedText, setPastedText] = useState('');

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear state to avoid showing again on refresh
      window.history.replaceState({}, document.title);
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  useEffect(() => {
    if (user) {
      loadBooks();
      loadReceivedBooks();
    }
  }, [user]);

  const handleManualRefresh = async () => {
    setIsImporting(true);
    try {
      await loadBooks();
      await loadReceivedBooks();
      setSuccessMessage("Library synced with cloud.");
    } catch (err) {
      setErrorMessage("Failed to sync library.");
    } finally {
      setIsImporting(false);
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedTitle.trim() || !pastedText.trim()) return;
    
    setIsImporting(true);
    setErrorMessage(null);
    setIsPasteModalOpen(false);
    
    try {
      const parsedBook = parseTXT(pastedText, true);
      
      const newBook: Book = {
        id: crypto.randomUUID(),
        title: pastedTitle.trim(),
        author: 'Unknown Author',
        content: parsedBook.content,
        totalPages: parsedBook.totalPages,
        lastReadPage: 1,
        addedAt: Date.now(),
        isArchived: false,
      };

      if (apiKey) {
        try {
          const settings = useStore.getState().settings;
          const analysis = await analyzeBookWithAI(parsedBook.content, apiKey, settings.aiLanguage, settings.aiChunkSizeMultiplier);
          if (analysis) {
            newBook.analysis = analysis;
          }
        } catch (err) {
          console.error('AI Analysis failed during import', err);
        }
      }

      await db.saveBook(newBook);
      await loadBooks();
      setSuccessMessage(`Added "${newBook.title}" to your library.`);
      setPastedTitle('');
      setPastedText('');
    } catch (err) {
      console.error('Import failed', err);
      setErrorMessage('Failed to import pasted text.');
    } finally {
      setIsImporting(false);
    }
  };
  const loadReceivedBooks = async () => {
    try {
      const rBooks = await db.getReceivedBooks();
      setReceivedBooks(rBooks);
    } catch (error: any) {
      console.error("Library loadReceivedBooks error:", error);
      setErrorMessage(`Failed to load shared books: ${error.message || 'Unknown error'}`);
    }
  };

  const loadBooks = async () => {
    const loadedBooks = await db.getAllBooks();
    // Sort by addedAt descending
    loadedBooks.sort((a, b) => b.addedAt - a.addedAt);
    setBooks(loadedBooks);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setErrorMessage(null);
    try {
      let parsedBook;
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        parsedBook = await parsePDF(arrayBuffer);
      } else if (file.type === 'text/plain') {
        const text = await file.text();
        parsedBook = parseTXT(text);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        parsedBook = await parseDOCX(arrayBuffer);
      } else {
        setErrorMessage('Unsupported file type. Please upload PDF, TXT, or DOCX.');
        setIsImporting(false);
        return;
      }

      const newBook: Book = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        author: 'Unknown Author',
        content: parsedBook.content,
        totalPages: parsedBook.totalPages,
        lastReadPage: 1,
        addedAt: Date.now(),
        isArchived: false,
      };

      if (apiKey) {
        try {
          const settings = useStore.getState().settings;
          const analysis = await analyzeBookWithAI(parsedBook.content, apiKey, settings.aiLanguage, settings.aiChunkSizeMultiplier);
          if (analysis) {
            newBook.analysis = analysis;
          }
        } catch (err) {
          console.error('AI Analysis failed during import', err);
        }
      }

      await db.saveBook(newBook);
      await loadBooks();
    } catch (err) {
      console.error('Import failed', err);
      setErrorMessage('Failed to import book.');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDelete = (id: string) => {
    setBookToDelete(id);
  };

  const confirmDelete = async () => {
    if (bookToDelete) {
      await db.deleteBook(bookToDelete);
      useStore.getState().deleteBook(bookToDelete);
      await loadBooks();
      setBookToDelete(null);
    }
  };

  const toggleArchive = async (book: Book) => {
    const updatedBook = { ...book, isArchived: !book.isArchived };
    await db.saveBook(updatedBook);
    await loadBooks();
  };

  const handleShare = async () => {
    if (!bookToShare || !shareEmail) return;
    setIsSharing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await db.shareBook(bookToShare, shareEmail);
      setSuccessMessage(`Book shared successfully! It is now waiting for ${shareEmail} to accept it in their "Books Shared With You" section.`);
      setBookToShare(null);
      setShareEmail('');
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        setErrorMessage("Firebase permissions error: Please update your Firestore Security Rules to enable book sharing.");
      } else {
        setErrorMessage(error.message || "Failed to share book.");
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleAcceptShare = async (sharedBook: any) => {
    setErrorMessage(null);
    try {
      let bookData = sharedBook.book;
      
      // If book is stored in chunks (large book)
      if (sharedBook.isChunked) {
        try {
          const fullJson = await db.getSharedBookChunks(sharedBook.id);
          bookData = JSON.parse(fullJson);
        } catch (err) {
          console.error("Error reassembling chunked book:", err);
          setErrorMessage("Failed to reassemble large book data. Please try again.");
          return;
        }
      } else if (sharedBook.bookUrl) {
        // Fallback for old storage-based shares
        try {
          const response = await fetch(sharedBook.bookUrl);
          if (!response.ok) throw new Error("Failed to download book data");
          bookData = await response.json();
        } catch (err) {
          console.error("Error downloading large book:", err);
          setErrorMessage("Failed to download large book data. Please try again.");
          return;
        }
      }

      if (!bookData) {
        setErrorMessage("Shared book data is missing.");
        return;
      }

      const newBook: Book = {
        ...bookData,
        id: crypto.randomUUID(), // Generate new ID for the recipient
        addedAt: Date.now(),
        lastReadPage: 1,
        isArchived: false,
      };
      await db.saveBook(newBook);
      await db.deleteReceivedBook(sharedBook.id);
      setSuccessMessage(`Added "${newBook.title}" to your library.`);
      await loadBooks();
      await loadReceivedBooks();
    } catch (error) {
      console.error("Error accepting share:", error);
      setErrorMessage("Failed to accept shared book.");
    }
  };

  const handleRejectShare = async (shareId: string) => {
    try {
      await db.deleteReceivedBook(shareId);
      await loadReceivedBooks();
    } catch (error) {
      setErrorMessage("Failed to reject shared book.");
    }
  };

  const displayedBooks = books.filter(b => showArchived ? b.isArchived : !b.isArchived);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto relative">
      {successMessage && (
        <div className="mb-4 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex justify-between items-center">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700">
            <Trash2 size={16} /> {/* Using Trash2 as a close icon placeholder, better to use X but it's not imported. Wait, I can just use a text 'Dismiss' */}
            Dismiss
          </button>
        </div>
      )}

      {bookToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-auto">
            <h3 className="text-xl font-semibold text-zinc-900 mb-2">Delete Book</h3>
            <p className="text-zinc-600 mb-6">Are you sure you want to delete this book? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setBookToDelete(null)}>Cancel</Button>
              <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white border-transparent">Delete</Button>
            </div>
          </div>
        </div>
      )}

      {bookToShare && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-auto">
            <h3 className="text-xl font-semibold text-zinc-900 mb-2">Share Book</h3>
            <p className="text-zinc-600 mb-4 text-sm">
              Send a copy of "{bookToShare.title}" to another user.
            </p>
            <input
              type="email"
              placeholder="Recipient's email address"
              className="w-full p-3 border border-zinc-300 rounded-xl mb-6 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setBookToShare(null)}>Cancel</Button>
              <Button onClick={handleShare} disabled={!shareEmail || isSharing} className="bg-zinc-900 text-white">
                {isSharing ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {receivedBooks.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 flex items-start gap-3">
          <Share2 className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-medium">You have {receivedBooks.length} pending shared {receivedBooks.length === 1 ? 'book' : 'books'}!</p>
            <p className="text-sm text-blue-600 mt-1">
            {receivedBooks.map(rb => {
              const title = rb.book?.title || rb.bookMetadata?.title || 'Unknown Book';
              return `${rb.senderName} (${rb.senderEmail}) sent you "${title}"`;
            }).join(', ')}
            </p>
          </div>
        </div>
      )}

      {receivedBooks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <Share2 size={20} className="text-blue-500" />
            Books Shared With You
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {receivedBooks.map((rb) => {
              const bookInfo = rb.book || rb.bookMetadata || { title: 'Unknown Book', author: 'Unknown Author' };
              return (
                <div key={rb.id} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
                  <div className="flex gap-4">
                    {/* Cover Image or Placeholder */}
                    <div className="w-16 h-24 shrink-0 rounded-md overflow-hidden bg-zinc-100 border border-zinc-200 flex items-center justify-center relative shadow-sm">
                      {bookInfo.coverUrl ? (
                        <img src={bookInfo.coverUrl} alt={bookInfo.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <BookOpen size={20} className="text-zinc-400" />
                      )}
                    </div>
                    
                    {/* Book Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h3 className="font-semibold text-zinc-900 line-clamp-2 leading-tight mb-1" title={bookInfo.title}>
                        {bookInfo.title}
                      </h3>
                      <p className="text-xs text-zinc-600 font-medium line-clamp-1 mb-2" title={bookInfo.author}>
                        {bookInfo.author || 'Unknown Author'}
                      </p>
                      <div className="mt-auto">
                        <p className="text-[11px] text-zinc-500">From: <span className="font-medium text-zinc-700">{rb.senderName}</span></p>
                        <p className="text-[10px] text-zinc-400">{new Date(rb.sentAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto pt-2 border-t border-zinc-100">
                    <Button size="sm" onClick={() => handleAcceptShare(rb)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Check size={16} className="mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRejectShare(rb.id)} className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50">
                      <X size={16} className="mr-1" /> Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
        <div className="flex flex-col">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">My Library</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm md:text-base text-zinc-500">Your personal collection of books and documents.</p>
            {user?.email && (
              <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-mono">
                {user.email}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            onClick={handleManualRefresh}
            className="w-full sm:w-auto justify-center"
            disabled={isImporting}
          >
            <RefreshCw size={18} className={cn("mr-2", isImporting && "animate-spin")} />
            Sync Cloud
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowArchived(!showArchived)}
            className="w-full sm:w-auto justify-center"
          >
            {showArchived ? 'Show Active Books' : 'Show Archived'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setIsPasteModalOpen(true)}
            className="w-full sm:w-auto justify-center"
            disabled={isImporting}
          >
            <FileText size={18} className="mr-2" />
            Paste Text
          </Button>
          <input
            type="file"
            id="import-file"
            className="hidden"
            accept=".pdf,.txt,.docx"
            onChange={handleImport}
            disabled={isImporting}
          />
          <label htmlFor="import-file" className="w-full sm:w-auto block">
            <Button as="span" className="cursor-pointer w-full sm:w-auto justify-center" disabled={isImporting}>
              {isImporting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Importing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload size={18} />
                  Import Book
                </span>
              )}
            </Button>
          </label>
        </div>
      </div>

      {displayedBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 md:py-24 px-4 text-center border-2 border-dashed border-zinc-200 rounded-2xl md:rounded-3xl bg-zinc-50/50">
          <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            {showArchived ? <Archive size={32} className="text-zinc-400" /> : <FileText size={32} className="text-zinc-400" />}
          </div>
          <h3 className="text-lg font-medium text-zinc-900">
            {showArchived ? 'No archived books' : 'Your library is empty'}
          </h3>
          <p className="text-sm md:text-base text-zinc-500 mt-1 max-w-sm">
            {showArchived 
              ? 'Books you archive will appear here.' 
              : 'Import a PDF or TXT file to start reading and analyzing your documents.'}
          </p>
          {!showArchived && (
            <label htmlFor="import-file" className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button variant="outline" as="span" className="cursor-pointer">
                <Plus size={18} className="mr-2" />
                Upload File
              </Button>
              <Button variant="outline" onClick={(e) => { e.preventDefault(); setIsPasteModalOpen(true); }} className="cursor-pointer">
                <FileText size={18} className="mr-2" />
                Paste Text
              </Button>
            </label>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-12 md:gap-x-8 md:gap-y-16 mt-8">
          {displayedBooks.map((book, index) => (
            <div
              key={book.id}
              className="group relative flex flex-col items-center"
            >
              {/* Shelf Base (Connects with adjacent items) */}
              <div className="absolute -bottom-4 left-[-1rem] right-[-1rem] md:left-[-2rem] md:right-[-2rem] h-4 bg-zinc-200/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] z-0" />
              <div className="absolute -bottom-4 left-[-1rem] right-[-1rem] md:left-[-2rem] md:right-[-2rem] h-1 bg-zinc-300/50 z-0" />

              {/* Book Number */}
              <div className="absolute -top-3 -left-2 bg-zinc-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-20 shadow-sm">
                #{index + 1}
              </div>

              {book.dramatization && (
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-20 flex items-center gap-1">
                  <Captions size={10} />
                  {book.dramatization.pages && book.totalPages > 0 ? (
                    <span>{Math.round((Object.keys(book.dramatization.pages).length / book.totalPages) * 100) === 100 ? <Check size={10} /> : `${Math.round((Object.keys(book.dramatization.pages).length / book.totalPages) * 100)}%`}</span>
                  ) : (
                    <span>AI</span>
                  )}
                </div>
              )}

              {/* Book Cover/Spine */}
              <Link 
                to={`/book/${book.id}`} 
                className={cn(
                  "w-full aspect-[2/3] rounded-r-lg rounded-l-sm shadow-[2px_0_5px_rgba(0,0,0,0.1)] hover:shadow-[4px_0_10px_rgba(0,0,0,0.15)] hover:-translate-y-2 transition-all duration-300 flex flex-col relative overflow-hidden z-10",
                  "bg-gradient-to-br from-zinc-100 to-zinc-200 border-l-[6px] border-zinc-300",
                  book.isArchived && "opacity-75 grayscale-[0.5]"
                )}
              >
                {book.coverUrl && (
                  <img src={book.coverUrl} alt={book.title} className="absolute inset-0 w-full h-full object-cover z-0" referrerPolicy="no-referrer" />
                )}
                
                {/* Spine texture */}
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/10 to-transparent z-10" />
                
                {!book.coverUrl && (
                  <div className="flex-1 p-4 flex flex-col items-center justify-center text-center z-10">
                    <BookOpen size={24} className="text-zinc-400 mb-3 opacity-50" />
                    <h3 className="font-serif font-bold text-zinc-800 line-clamp-3 text-sm md:text-base leading-tight mb-2">{book.title}</h3>
                    <p className="text-[10px] md:text-xs text-zinc-500 font-medium uppercase tracking-wider line-clamp-2">{book.author}</p>
                  </div>
                )}
                
                <div className="h-1.5 w-full bg-zinc-300 mt-auto z-10">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${(book.lastReadPage / book.totalPages) * 100}%` }}
                  />
                </div>
              </Link>
              
              {/* Actions Hover Menu */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all z-30 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-zinc-200">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleArchive(book);
                  }}
                  className="p-2 text-zinc-600 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                  title={book.isArchived ? "Unarchive" : "Archive"}
                >
                  {book.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/edit/${book.id}`);
                  }}
                  className="p-2 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                  title="Edit book"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setBookToShare(book);
                  }}
                  className="p-2 text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                  title="Share Book"
                >
                  <Share2 size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(book.id);
                  }}
                  className="p-2 text-zinc-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title="Delete book"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {isPasteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-2xl w-full mx-auto flex flex-col max-h-[90vh]">
            <h3 className="text-xl font-semibold text-zinc-900 mb-4">Paste Text</h3>
            
            <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
                <input
                  type="text"
                  placeholder="Enter book title"
                  className="w-full p-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                />
              </div>
              
              <div className="flex-1 flex flex-col">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Text Content</label>
                <textarea
                  placeholder="Paste your text here..."
                  className="w-full p-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none flex-1 min-h-[200px] resize-none"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100 shrink-0">
              <Button variant="outline" onClick={() => setIsPasteModalOpen(false)}>Cancel</Button>
              <Button 
                onClick={handlePasteSubmit} 
                disabled={!pastedTitle.trim() || !pastedText.trim() || isImporting} 
                className="bg-zinc-900 text-white"
              >
                {isImporting ? 'Importing...' : 'Import Text'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
