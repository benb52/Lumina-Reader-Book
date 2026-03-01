import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Library from './pages/Library';
import BookReader from './pages/BookReader';
import BookOrchestrator from './pages/BookOrchestrator';
import Settings from './pages/Settings';
import Statistics from './pages/Statistics';
import Vocabulary from './pages/Vocabulary';
import AdminDashboard from './pages/AdminDashboard';
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from './lib/db';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useStore((state) => state.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const login = useStore((state) => state.login);
  const logout = useStore((state) => state.logout);
  const updateSettings = useStore((state) => state.updateSettings);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userData = { uid: user.uid, email: user.email || '', name: user.email?.split('@')[0] || 'User' };
        login(userData);
        db.updateUserMetadata(userData);
        // Load settings from Firebase
        const userSettings = await db.getSettings();
        if (userSettings) {
          updateSettings(userSettings);
        }
      } else {
        logout();
      }
      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, [login, logout, updateSettings]);

  if (isAuthChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Library />} />
          <Route path="edit/:id" element={<BookOrchestrator />} />
          <Route path="stats" element={<Statistics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="vocabulary" element={<Vocabulary />} />
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
        <Route
          path="/book/:id"
          element={
            <ProtectedRoute>
              <BookReader />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
