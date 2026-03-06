import { useState, useEffect, useMemo } from 'react';
import { BarChart3, BookOpen, Clock, Target, CalendarDays, Globe, TrendingUp } from 'lucide-react';
import { useStore } from '../store/useStore';
import { db } from '../lib/db';
import { cn } from '../lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function Statistics() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const readingSessions = useStore((state) => state.readingSessions);
  
  const [stats, setStats] = useState({
    totalBooks: 0,
    totalPagesRead: 0,
    completionRate: 0,
    totalHours: 0,
  });

  const [languageStats, setLanguageStats] = useState<Record<string, number>>({});
  const [chartData, setChartData] = useState<any[]>([]);

  const timeframe = settings.statisticsTimeframe || 'all';

  const setTimeframe = (newTimeframe: 'day' | 'week' | 'month' | 'year' | 'all') => {
    updateSettings({ statisticsTimeframe: newTimeframe });
    db.saveSettings({ ...settings, statisticsTimeframe: newTimeframe });
  };

  useEffect(() => {
    loadStats();
  }, [timeframe, readingSessions]);

  const loadStats = async () => {
    const books = await db.getAllBooks();
    
    let filteredSessions = readingSessions;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    if (timeframe === 'day') {
      filteredSessions = readingSessions.filter(s => now - s.date < dayMs);
    } else if (timeframe === 'week') {
      filteredSessions = readingSessions.filter(s => now - s.date < dayMs * 7);
    } else if (timeframe === 'month') {
      filteredSessions = readingSessions.filter(s => now - s.date < dayMs * 30);
    } else if (timeframe === 'year') {
      filteredSessions = readingSessions.filter(s => now - s.date < dayMs * 365);
    }

    // Calculate stats from sessions
    let pagesFromSessions = 0;
    let secondsFromSessions = 0;
    let booksReadInTimeframe = new Set();
    const langStats: Record<string, number> = {};

    filteredSessions.forEach(session => {
      pagesFromSessions += session.pagesRead;
      secondsFromSessions += session.durationSeconds;
      booksReadInTimeframe.add(session.bookId);
      
      const lang = session.language || 'Unknown';
      langStats[lang] = (langStats[lang] || 0) + session.pagesRead;
    });

    // Prepare chart data
    const dataMap = new Map<string, { date: string, pages: number, duration: number }>();
    
    filteredSessions.forEach(session => {
      const dateObj = new Date(session.date);
      let dateKey = '';
      
      if (timeframe === 'day' || timeframe === 'week' || timeframe === 'month') {
        dateKey = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } else if (timeframe === 'year') {
        dateKey = dateObj.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      } else {
        dateKey = dateObj.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      }

      const existing = dataMap.get(dateKey) || { date: dateKey, pages: 0, duration: 0 };
      existing.pages += session.pagesRead;
      existing.duration += Math.round(session.durationSeconds / 60); // in minutes
      dataMap.set(dateKey, existing);
    });

    // Sort by actual date (this is a bit tricky with formatted strings, so we sort the sessions first or parse back)
    // A simpler way is to sort the map keys by creating a Date object from them, but since we process filteredSessions,
    // let's just sort the final array by assuming the order might be mixed, or we sort filteredSessions first.
    
    const sortedSessions = [...filteredSessions].sort((a, b) => a.date - b.date);
    const sortedDataMap = new Map<string, { date: string, pages: number, duration: number }>();
    
    sortedSessions.forEach(session => {
      const dateObj = new Date(session.date);
      let dateKey = '';
      if (timeframe === 'day' || timeframe === 'week' || timeframe === 'month') {
        dateKey = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } else {
        dateKey = dateObj.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      }
      const existing = sortedDataMap.get(dateKey) || { date: dateKey, pages: 0, duration: 0 };
      existing.pages += session.pagesRead;
      existing.duration += Math.round(session.durationSeconds / 60);
      sortedDataMap.set(dateKey, existing);
    });

    setChartData(Array.from(sortedDataMap.values()));

    if (timeframe === 'all') {
      // For 'all' time, we can also use the book's lastReadPage as a fallback/baseline
      let totalPagesRead = 0;
      let totalPages = 0;
      
      books.forEach(book => {
        totalPagesRead += book.lastReadPage;
        totalPages += book.totalPages;
      });
      
      const completionRate = totalPages > 0 ? Math.round((totalPagesRead / totalPages) * 100) : 0;
      
      setStats({
        totalBooks: books.length,
        totalPagesRead: Math.max(totalPagesRead, pagesFromSessions), // Use whichever is higher
        completionRate,
        totalHours: Math.round((secondsFromSessions / 3600) * 10) / 10
      });
    } else {
      // For specific timeframes, only use session data
      setStats({
        totalBooks: booksReadInTimeframe.size,
        totalPagesRead: pagesFromSessions,
        completionRate: 0, // Completion rate doesn't make as much sense for a specific timeframe
        totalHours: Math.round((secondsFromSessions / 3600) * 10) / 10
      });
    }
  };

  const timeframeOptions = [
    { id: 'day', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
    { id: 'all', label: 'All Time' },
  ] as const;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 text-emerald-600 p-2 md:p-3 rounded-2xl">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">Reading Stats</h1>
            <p className="text-sm md:text-base text-zinc-500 mt-1">Track your reading habits and progress.</p>
          </div>
        </div>
        
        <div className="flex bg-zinc-100 p-1 rounded-xl overflow-x-auto">
          {timeframeOptions.map(option => (
            <button
              key={option.id}
              onClick={() => setTimeframe(option.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
                timeframe === option.id 
                  ? "bg-white text-zinc-900 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
            <BookOpen size={24} />
          </div>
          <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.totalBooks}</div>
          <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Books Read</div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center mb-4">
            <BarChart3 size={24} />
          </div>
          <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.totalPagesRead}</div>
          <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Pages Read</div>
        </div>

        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-4">
            <Clock size={24} />
          </div>
          <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.totalHours}</div>
          <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Hours Read</div>
        </div>
        
        {timeframe === 'all' && (
          <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <Target size={24} />
            </div>
            <div className="text-3xl md:text-4xl font-semibold text-zinc-900 mb-1">{stats.completionRate}%</div>
            <div className="text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">Completion Rate</div>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm mb-8">
          <h2 className="text-lg md:text-xl font-semibold text-zinc-900 mb-6 flex items-center gap-2">
            <TrendingUp className="text-zinc-400" size={20} />
            Reading Trends
          </h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  yAxisId="left"
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 12 }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  cursor={{ stroke: '#e4e4e7', strokeWidth: 2 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  name="Pages Read"
                  dataKey="pages" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  name="Duration (min)"
                  dataKey="duration" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm">
          <h2 className="text-lg md:text-xl font-semibold text-zinc-900 mb-4 md:mb-6 flex items-center gap-2">
            <Globe className="text-zinc-400" size={20} />
            Reading by Language
          </h2>
          
          {Object.keys(languageStats).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(languageStats)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([lang, pages]) => (
                <div key={lang}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-zinc-700">{lang}</span>
                    <span className="text-zinc-500">{pages} pages</span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-full rounded-full"
                      style={{ width: `${(Number(pages) / stats.totalPagesRead) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-zinc-500 py-8">
              No language data available for this timeframe.
            </div>
          )}
        </div>

        <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-zinc-200 shadow-sm">
          <h2 className="text-lg md:text-xl font-semibold text-zinc-900 mb-4 md:mb-6 flex items-center gap-2">
            <CalendarDays className="text-zinc-400" size={20} />
            Daily Goal Progress
          </h2>
          
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
    </div>
  );
}
