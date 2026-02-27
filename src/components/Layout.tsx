import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { BookOpen, Settings, LogOut, Library as LibraryIcon, Users, BarChart3, Menu, X, BookA } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { Button } from './ui/Button';

export default function Layout() {
  const location = useLocation();
  const logout = useStore((state) => state.logout);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      logout();
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const navItems = [
    { name: 'Library', path: '/', icon: LibraryIcon },
    { name: 'Vocabulary', path: '/vocabulary', icon: BookA },
    { name: 'Book Club', path: '/club', icon: Users },
    { name: 'Statistics', path: '/stats', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-4 md:px-8 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 text-white p-1.5 rounded-lg">
            <BookOpen size={20} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight hidden sm:block">Lumina</h1>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                )}
              >
                <item.icon size={16} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>

          {/* Mobile Menu Toggle */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </Button>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-white border-b border-zinc-200 shadow-lg z-30 flex flex-col p-4 gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                )}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            );
          })}
          <div className="h-px bg-zinc-200 my-2" />
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              handleLogout();
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
