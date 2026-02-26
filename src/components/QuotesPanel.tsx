import { useState } from 'react';
import { X, MessageSquare, Trash2, Share2, Download } from 'lucide-react';
import { Button } from './ui/Button';

interface Quote {
  id: string;
  text: string;
  note?: string;
  color: string;
  page: number;
}

export default function QuotesPanel({ 
  quotes, 
  onClose, 
  onDelete 
}: { 
  quotes: Quote[], 
  onClose: () => void,
  onDelete: (id: string) => void
}) {

  const handleExport = () => {
    if (quotes.length === 0) return;
    
    let markdown = `# My Quotes\n\n`;
    quotes.forEach(q => {
      markdown += `> "${q.text}"\n`;
      markdown += `> — *Page ${q.page}*\n\n`;
      if (q.note) {
        markdown += `**Note:** ${q.note}\n\n`;
      }
      markdown += `---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lumina-quotes.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-zinc-200 shadow-xl flex flex-col z-40 animate-in slide-in-from-right">
      <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
        <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
          <MessageSquare size={18} />
          My Quotes
        </h2>
        <div className="flex items-center gap-1">
          {quotes.length > 0 && (
            <Button variant="ghost" size="icon" onClick={handleExport} title="Export to Markdown">
              <Download size={18} />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {quotes.length === 0 ? (
          <div className="text-center text-zinc-500 mt-10 text-sm">
            No quotes saved yet. Select text while reading to save a quote.
          </div>
        ) : (
          quotes.map(quote => (
            <div key={quote.id} className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full bg-${quote.color}-400`} />
                <span className="text-xs text-zinc-500 font-medium">Page {quote.page}</span>
              </div>
              <p className="text-sm text-zinc-800 italic mb-3">"{quote.text}"</p>
              {quote.note && (
                <p className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded-lg mb-3">
                  📝 {quote.note}
                </p>
              )}
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <Share2 size={14} className="mr-1" /> Share
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(quote.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
