import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, Upload, Trash2, Edit3, BookOpen, Archive, ArchiveRestore } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';
import { extractTextFromPDF, extractTextFromTXT } from '../services/pdf';
import { analyzeBookWithAI } from '../services/ai';
import { cn } from '../lib/utils';

export default function Library() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const apiKey = useStore((state) => state.settings.apiKey);

  useEffect(() => {
    loadBooks();
  }, []);

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
      let content = '';
      if (file.type === 'application/pdf') {
        content = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain') {
        content = await extractTextFromTXT(file);
      } else {
        setErrorMessage('Unsupported file type. Please upload PDF or TXT.');
        setIsImporting(false);
        return;
      }

      const newBook: Book = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        author: 'Unknown Author',
        content,
        totalPages: content.split('<<LUMINA_PAGE_BREAK>>').length - 1 || 1,
        lastReadPage: 1,
        addedAt: Date.now(),
        isArchived: false,
      };

      if (apiKey) {
        try {
          const analysis = await analyzeBookWithAI(content, apiKey);
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

  const displayedBooks = books.filter(b => showArchived ? b.isArchived : !b.isArchived);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto relative">
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">My Library</h1>
          <p className="text-sm md:text-base text-zinc-500 mt-1">Your personal collection of books and documents.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            onClick={() => setShowArchived(!showArchived)}
            className="w-full sm:w-auto justify-center"
          >
            {showArchived ? 'Show Active Books' : 'Show Archived'}
          </Button>
          <input
            type="file"
            id="import-file"
            className="hidden"
            accept=".pdf,.txt"
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
            <label htmlFor="import-file" className="mt-6">
              <Button variant="outline" as="span" className="cursor-pointer">
                <Plus size={18} className="mr-2" />
                Add your first book
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

              {/* Book Cover/Spine */}
              <Link 
                to={`/book/${book.id}`} 
                className={cn(
                  "w-full aspect-[2/3] rounded-r-lg rounded-l-sm shadow-[2px_0_5px_rgba(0,0,0,0.1)] hover:shadow-[4px_0_10px_rgba(0,0,0,0.15)] hover:-translate-y-2 transition-all duration-300 flex flex-col relative overflow-hidden z-10",
                  "bg-gradient-to-br from-zinc-100 to-zinc-200 border-l-[6px] border-zinc-300",
                  book.isArchived && "opacity-75 grayscale-[0.5]"
                )}
              >
                {/* Spine texture */}
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/10 to-transparent" />
                
                <div className="flex-1 p-4 flex flex-col items-center justify-center text-center z-10">
                  <BookOpen size={24} className="text-zinc-400 mb-3 opacity-50" />
                  <h3 className="font-serif font-bold text-zinc-800 line-clamp-3 text-sm md:text-base leading-tight mb-2">{book.title}</h3>
                  <p className="text-[10px] md:text-xs text-zinc-500 font-medium uppercase tracking-wider line-clamp-2">{book.author}</p>
                </div>
                
                <div className="h-1.5 w-full bg-zinc-300 mt-auto">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${(book.lastReadPage / book.totalPages) * 100}%` }}
                  />
                </div>
              </Link>
              
              {/* Actions Hover Menu */}
              <div className="absolute -bottom-16 right-0 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all z-30">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleArchive(book);
                  }}
                  className="p-2 text-zinc-500 hover:text-amber-600 hover:bg-amber-50 rounded-full bg-white shadow-sm border border-zinc-200 transition-colors"
                  title={book.isArchived ? "Unarchive" : "Archive"}
                >
                  {book.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/edit/${book.id}`);
                  }}
                  className="p-2 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 rounded-full bg-white shadow-sm border border-zinc-200 transition-colors"
                  title="Edit book"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(book.id);
                  }}
                  className="p-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-full bg-white shadow-sm border border-zinc-200 transition-colors"
                  title="Delete book"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
