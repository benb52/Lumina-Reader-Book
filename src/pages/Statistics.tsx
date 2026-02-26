import { useState, useEffect } from 'react';
import { BarChart3, BookOpen, Clock, Target } from 'lucide-react';
import { useStore } from '../store/useStore';
import { db } from '../lib/db';

export default function Statistics() {
  const settings = useStore((state) => state.settings);
  const [stats, setStats] = useState({
    totalBooks: 0,
    totalPagesRead: 0,
    completionRate: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const books = await db.getAllBooks();
    const totalBooks = books.length;
    
    let totalPagesRead = 0;
    let totalPages = 0;
    
    books.forEach(book => {
      totalPagesRead += book.lastReadPage;
      totalPages += book.totalPages;
    });
    
    const completionRate = totalPages > 0 ? Math.round((totalPagesRead / totalPages) * 100) : 0;
    
    setStats({
      totalBooks,
      totalPagesRead,
      completionRate
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <div className="bg-emerald-100 text-emerald-600 p-2 md:p-3 rounded-2xl">
          <BarChart3 size={24} />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">Reading Stats</h1>
          <p className="text-sm md:text-base text-zinc-500 mt-1">Track your reading habits and progress.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
            <BookOpen size={24} />
          </div>
          <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.totalBooks}</div>
          <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Books in Library</div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center mb-4">
            <Clock size={24} />
          </div>
          <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.totalPagesRead}</div>
          <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Pages Read</div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center sm:col-span-2 md:col-span-1">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
            <Target size={24} />
          </div>
          <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.completionRate}%</div>
          <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Completion Rate</div>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm">
        <h2 className="text-lg md:text-xl font-semibold text-zinc-900 mb-4 md:mb-6">Daily Goal Progress</h2>
        
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-600">Today's Progress</span>
          <span className="text-sm font-semibold text-zinc-900">
            {Math.min(stats.totalPagesRead, settings.dailyGoalPages)} / {settings.dailyGoalPages} pages
          </span>
        </div>
        
        <div className="w-full bg-zinc-100 rounded-full h-3 md:h-4 mb-6 overflow-hidden">
          <div 
            className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${Math.min((stats.totalPagesRead / settings.dailyGoalPages) * 100, 100)}%` }}
          />
        </div>
        
        {stats.totalPagesRead >= settings.dailyGoalPages ? (
          <div className="p-3 md:p-4 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium text-center border border-emerald-100">
            🎉 Congratulations! You've reached your daily reading goal!
          </div>
        ) : (
          <div className="p-3 md:p-4 bg-zinc-50 text-zinc-600 rounded-xl text-sm text-center border border-zinc-100">
            Keep reading to reach your daily goal of {settings.dailyGoalPages} pages.
          </div>
        )}
      </div>
    </div>
  );
}
