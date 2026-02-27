import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { BookOpen } from 'lucide-react';
import { auth } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

export default function Login() {
  const login = useStore((state) => state.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    
    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        setSuccessMessage('הרשמה והתחברות הצליחו! מעביר אותך...');
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        setSuccessMessage('התחברות הצליחה! מעביר אותך...');
      }
      
      const user = userCredential.user;
      
      setTimeout(() => {
        login({ uid: user.uid, email: user.email || '', name: user.email?.split('@')[0] || 'User' });
        navigate('/');
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
         setError('אימייל או סיסמה שגויים.');
      } else if (err.code === 'auth/email-already-in-use') {
         setError('כתובת האימייל הזו כבר בשימוש.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      
      setSuccessMessage('התחברות באמצעות Google הצליחה! מעביר אותך...');
      
      setTimeout(() => {
        login({ 
          uid: user.uid, 
          email: user.email || '', 
          name: user.displayName || user.email?.split('@')[0] || 'User' 
        });
        navigate('/');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('ההתחברות בוטלה על ידי המשתמש.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('שגיאה: הדומיין הנוכחי אינו מורשה ב-Firebase. יש להוסיף את הדומיינים הבאים לרשימת ה-Authorized domains ב-Firebase Console תחת Authentication -> Settings: \n1. ais-dev-afaczz7qiyvjl4smbm6qyc-21130721155.europe-west3.run.app\n2. ais-pre-afaczz7qiyvjl4smbm6qyc-21130721155.europe-west3.run.app');
      } else {
        setError('התחברות באמצעות Google נכשלה: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 font-sans" dir="rtl">
      <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-sm border border-zinc-100">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-zinc-900 text-white p-3 rounded-2xl mb-4">
            <BookOpen size={32} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">ברוכים הבאים ל-Lumina</h1>
          <p className="text-zinc-500 text-sm mt-2 text-center">
            {isSignUp ? 'צור חשבון כדי להתחיל לקרוא' : 'התחבר כדי לגשת לספרייה שלך'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200 flex flex-col gap-3">
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-emerald-50 text-emerald-700 text-sm rounded-xl border border-emerald-200">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">
              כתובת אימייל
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all text-left"
              placeholder="you@example.com"
              dir="ltr"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1">
              סיסמה
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all text-left"
              placeholder="••••••••"
              dir="ltr"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? 'אנא המתן...' : (isSignUp ? 'צור חשבון' : 'התחבר')}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-zinc-500">או</span>
          </div>
        </div>

        <Button 
          type="button" 
          variant="outline" 
          className="w-full bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 flex items-center justify-center gap-2" 
          size="lg" 
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          המשך עם Google
        </Button>

        <div className="mt-6 text-center">
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              setSuccessMessage('');
            }}
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            {isSignUp ? 'כבר יש לך חשבון? התחבר' : "אין לך חשבון? הירשם"}
          </button>
        </div>
      </div>
    </div>
  );
}
