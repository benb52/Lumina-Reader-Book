import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, X, ChevronLeft, ChevronRight, Trash, Plus, Bold, Underline } from 'lucide-react';
import { useStore, Book } from '../store/useStore';
import { db } from '../lib/db';
import { Button } from '../components/ui/Button';

export default function BookOrchestrator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const updateBook = useStore((state) => state.updateBook);
  
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageToDelete, setPageToDelete] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bookLanguage, setBookLanguage] = useState<string>('');

  useEffect(() => {
    if (id) {
      loadBook(id);
    }
  }, [id]);

  const loadBook = async (bookId: string) => {
    const b = await db.getBook(bookId);
    if (b) {
      setBook(b);
      setBookLanguage(b.language || '');
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

  const handleSave = async () => {
    if (!book) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      // Reconstruct content with markers
      const content = pages.map((p, i) => `<<PAGE:${i + 1}>>\n${p}`).join('\n<<LUMINA_PAGE_BREAK>>\n');
      
      const updatedBook = { 
        ...book, 
        content,
        totalPages: pages.length,
        language: bookLanguage
      };
      await db.saveBook(updatedBook);
      updateBook(book.id, { 
        content,
        totalPages: updatedBook.totalPages,
        language: bookLanguage
      });
      navigate(`/book/${book.id}`);
    } catch (err) {
      console.error('Failed to save book', err);
      setErrorMessage('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!book) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 relative">
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
            <label className="text-sm text-zinc-600">Language:</label>
            <input 
              type="text" 
              value={bookLanguage} 
              onChange={(e) => setBookLanguage(e.target.value)}
              placeholder="e.g. English, Spanish"
              className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <Button variant="outline" onClick={() => navigate(`/book/${book.id}`)} className="flex-1 sm:flex-none justify-center">
            <X size={16} className="mr-2" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex-1 sm:flex-none justify-center">
            {isSaving ? 'Saving...' : (
              <><Save size={16} className="mr-2" /> Save</>
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-4 md:p-6 max-w-5xl mx-auto w-full flex flex-col">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 flex-1 flex flex-col overflow-hidden">
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
          <textarea
            id="page-editor"
            value={pages[currentPageIndex] || ''}
            onChange={(e) => handleContentChange(e.target.value)}
            className="flex-1 w-full p-4 md:p-6 resize-none focus:outline-none focus:ring-0 font-mono text-xs md:text-sm leading-relaxed text-zinc-800"
            spellCheck={false}
            placeholder="Enter page content here..."
          />
        </div>
      </div>
    </div>
  );
}
