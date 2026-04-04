import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Save, Key, Volume2, Target, User as UserIcon, Eye, EyeOff, Lock } from 'lucide-react';
import { db } from '../lib/db';
import { auth } from '../lib/firebase';
import { updatePassword } from 'firebase/auth';

export default function Settings() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const user = useStore((state) => state.user);
  const login = useStore((state) => state.login);

  const [localSettings, setLocalSettings] = useState(settings);
  const [localName, setLocalName] = useState(user?.name || '');
  const [isSaved, setIsSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (user) {
      setLocalName(user.name);
    }
  }, [user]);

  const handleSave = async () => {
    updateSettings(localSettings);
    await db.saveSettings(localSettings);
    
    if (user && localName !== user.name) {
      const updatedUser = { ...user, name: localName };
      login(updatedUser);
      await db.updateUserMetadata(updatedUser);
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    if (!auth.currentUser) {
      setPasswordMessage({ type: 'error', text: 'You must be logged in to change your password.' });
      return;
    }

    setIsChangingPassword(true);
    setPasswordMessage(null);

    try {
      await updatePassword(auth.currentUser, newPassword);
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setNewPassword('');
    } catch (error: any) {
      console.error("Error updating password:", error);
      if (error.code === 'auth/requires-recent-login') {
        setPasswordMessage({ type: 'error', text: 'Please log out and log back in to change your password.' });
      } else {
        setPasswordMessage({ type: 'error', text: error.message || 'Failed to update password.' });
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your AI integrations and reading preferences.</p>
      </div>

      <div className="space-y-8">
        {/* User Profile */}
        <section className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-purple-50 text-purple-600 p-2 rounded-xl">
              <UserIcon size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">User Profile</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="Your Name"
              />
              <p className="text-xs text-zinc-500 mt-2">
                This name will be displayed in the app and when you share books with others.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-500 cursor-not-allowed"
              />
            </div>
          </div>
        </section>

        {/* Account Security */}
        <section className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-red-50 text-red-600 p-2 rounded-xl">
              <Lock size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">Account Security</h2>
          </div>
          
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Change Password
              </label>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="New Password (min. 6 characters)"
                />
                <Button type="submit" disabled={isChangingPassword || !newPassword}>
                  {isChangingPassword ? 'Updating...' : 'Update'}
                </Button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                If you signed in with Google, updating your password will allow you to also sign in using your email and this new password.
              </p>
              {passwordMessage && (
                <p className={`text-sm mt-2 ${passwordMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {passwordMessage.text}
                </p>
              )}
            </div>
          </form>
        </section>

        {/* API Settings */}
        <section className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
              <Key size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">AI & API Configuration</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-zinc-700">
                  Gemini API Key
                </label>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                >
                  Get an API key here
                </a>
              </div>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={localSettings.apiKey || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value.trim() })}
                  className="w-full px-4 py-2.5 pr-12 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="AIzaSy..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Required for AI analysis, translation, and definitions. Your key is stored securely in your personal account and cannot be accessed by other users.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  AI Features Language
                </label>
                <select
                  value={localSettings.aiLanguage || 'he'}
                  onChange={(e) => setLocalSettings({ ...localSettings, aiLanguage: e.target.value as 'he' | 'en' | 'es' })}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="he">Hebrew</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
                <p className="text-xs text-zinc-500 mt-1">
                  Language for AI Summary and X-Ray.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  AI Context Size (Save API Calls)
                </label>
                <select
                  value={localSettings.aiChunkSizeMultiplier || 1}
                  onChange={(e) => setLocalSettings({ ...localSettings, aiChunkSizeMultiplier: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="1">1x (Default - Faster)</option>
                  <option value="2">2x (Longer context)</option>
                  <option value="3">3x (Max context - Saves calls)</option>
                </select>
                <p className="text-xs text-zinc-500 mt-1">
                  Send more text to Gemini at once to reduce the number of API calls.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Reading Preferences */}
        <section className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl">
              <Volume2 size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">Reading & TTS</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Font Family
              </label>
              <select
                value={localSettings.fontFamily || 'serif'}
                onChange={(e) => setLocalSettings({ ...localSettings, fontFamily: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="serif">Serif (Georgia, Times)</option>
                <option value="sans">Sans-serif (Inter, Arial)</option>
                <option value="mono">Monospace (JetBrains, Courier)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Font Size ({localSettings.fontSize}px)
              </label>
              <input
                type="range"
                min="12"
                max="32"
                value={localSettings.fontSize || 18}
                onChange={(e) => setLocalSettings({ ...localSettings, fontSize: parseInt(e.target.value) })}
                className="w-full mt-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Highlight Style (During TTS)
              </label>
              <select
                value={localSettings.highlightStyle || 'yellow-bg'}
                onChange={(e) => setLocalSettings({ ...localSettings, highlightStyle: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="yellow-bg">Yellow Background</option>
                <option value="underline">Underline</option>
                <option value="bold">Bold Text</option>
                <option value="text-blue">Blue Text</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                TTS Provider
              </label>
              <select
                value={localSettings.ttsProvider || 'browser'}
                onChange={(e) => setLocalSettings({ ...localSettings, ttsProvider: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="browser">Browser Native</option>
                <option value="gemini">Gemini API (High Quality)</option>
              </select>
              {localSettings.ttsProvider === 'gemini' && !localSettings.apiKey && (
                <p className="text-xs text-red-500 mt-1">Requires Gemini API Key above.</p>
              )}
            </div>

            {localSettings.ttsProvider === 'gemini' && !localSettings.isDramatizedReadingEnabled && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Gemini Voice
                </label>
                <select
                  value={localSettings.geminiVoice || 'Kore'}
                  onChange={(e) => setLocalSettings({ ...localSettings, geminiVoice: e.target.value as any })}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="Puck">Puck</option>
                  <option value="Charon">Charon</option>
                  <option value="Kore">Kore</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Zephyr">Zephyr</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                TTS Speed ({localSettings.ttsSpeed}x)
              </label>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={localSettings.ttsSpeed || 1.0}
                onChange={(e) => setLocalSettings({ ...localSettings, ttsSpeed: parseFloat(e.target.value) })}
                className="w-full mt-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Subtitle Language
              </label>
              <select
                value={localSettings.subtitleLanguage || 'Hebrew'}
                onChange={(e) => setLocalSettings({ ...localSettings, subtitleLanguage: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="Hebrew">Hebrew</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Russian">Russian</option>
                <option value="Arabic">Arabic</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-xl bg-zinc-50/50">
              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Auto-Turn Page
                </label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Automatically go to the next page when TTS finishes reading.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!localSettings.autoTurnPage}
                  onChange={(e) => setLocalSettings({ ...localSettings, autoTurnPage: e.target.checked })}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-xl bg-zinc-50/50">
              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Enable Subtitles
                </label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Show translated subtitles while reading.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!localSettings.isSubtitleTranslationEnabled}
                  onChange={(e) => setLocalSettings({ ...localSettings, isSubtitleTranslationEnabled: e.target.checked })}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-xl bg-zinc-50/50">
              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Highlight Saved Quotes
                </label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Show a light green highlight on text you've saved to My Quotes.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!localSettings.highlightSavedQuotes}
                  onChange={(e) => setLocalSettings({ ...localSettings, highlightSavedQuotes: e.target.checked })}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-xl bg-zinc-50/50">
              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Dramatized Reading (AI)
                </label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Use different voices for different characters (Requires AI analysis per page).
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!localSettings.isDramatizedReadingEnabled}
                  onChange={(e) => setLocalSettings({ ...localSettings, isDramatizedReadingEnabled: e.target.checked })}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Goals */}
        <section className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-orange-50 text-orange-600 p-2 rounded-xl">
              <Target size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">Reading Goals</h2>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Daily Goal (Pages)
            </label>
            <input
              type="number"
              min="1"
              value={localSettings.dailyGoalPages || 30}
              onChange={(e) => setLocalSettings({ ...localSettings, dailyGoalPages: parseInt(e.target.value) })}
              className="w-full md:w-1/2 px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} size="lg" className="min-w-[120px]">
            {isSaved ? 'Saved!' : (
              <span className="flex items-center gap-2">
                <Save size={18} />
                Save Changes
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
