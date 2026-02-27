import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Save, Key, Volume2, Target } from 'lucide-react';
import { db } from '../lib/db';

export default function Settings() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);

  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    updateSettings(localSettings);
    await db.saveSettings(localSettings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your AI integrations and reading preferences.</p>
      </div>

      <div className="space-y-8">
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
              <input
                type="password"
                value={localSettings.apiKey}
                onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value.trim() })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="AIzaSy..."
              />
              <p className="text-xs text-zinc-500 mt-2">
                Required for AI analysis, translation, and definitions. Your key is stored locally in your browser.
              </p>
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
                value={localSettings.fontFamily}
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
                value={localSettings.fontSize}
                onChange={(e) => setLocalSettings({ ...localSettings, fontSize: parseInt(e.target.value) })}
                className="w-full mt-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Highlight Style (During TTS)
              </label>
              <select
                value={localSettings.highlightStyle}
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
                value={localSettings.ttsProvider}
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

            {localSettings.ttsProvider === 'gemini' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Gemini Voice
                </label>
                <select
                  value={localSettings.geminiVoice}
                  onChange={(e) => setLocalSettings({ ...localSettings, geminiVoice: e.target.value as any })}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="Puck">Puck</option>
                  <option value="Charon">Charon</option>
                  <option value="Kore">Kore</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Zephyr">Zephyr</option>
                  <option value="Aoede">Aoede</option>
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
                value={localSettings.ttsSpeed}
                onChange={(e) => setLocalSettings({ ...localSettings, ttsSpeed: parseFloat(e.target.value) })}
                className="w-full mt-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Subtitle Language
              </label>
              <select
                value={localSettings.subtitleLanguage}
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
                  checked={localSettings.autoTurnPage}
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
                  checked={localSettings.isSubtitleTranslationEnabled}
                  onChange={(e) => setLocalSettings({ ...localSettings, isSubtitleTranslationEnabled: e.target.checked })}
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
              value={localSettings.dailyGoalPages}
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
