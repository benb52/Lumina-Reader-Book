import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { db } from '../lib/db';
import { Database, Users, BookOpen, Activity, Shield, Key, AlertCircle, Settings as SettingsIcon, X, Save, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/ui/Button';

interface UserStats {
  uid: string;
  email: string;
  name: string;
  lastLogin: number;
  bookCount: number;
  isApiKeyManaged?: boolean;
  managedApiKey?: string;
  apiKeyLimit?: number;
  apiKeyUsage?: number;
}

export default function AdminDashboard() {
  const user = useStore((state) => state.user);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [editingUser, setEditingUser] = useState<UserStats | null>(null);
  const [managedKey, setManagedKey] = useState('');
  const [limit, setLimit] = useState(100);
  const [isManaged, setIsManaged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchAdminData = async () => {
    if (!user?.isAdmin) return;

    try {
      const allUsers = await db.getAllUsers();
      const usersWithStats = await Promise.all(
        allUsers.map(async (u) => {
          const bookCount = await db.getUserBooksCount(u.uid);
          return {
            ...u,
            bookCount,
          } as UserStats;
        })
      );
      setUsers(usersWithStats.sort((a, b) => b.lastLogin - a.lastLogin));
    } catch (err: any) {
      console.error("Error fetching admin data:", err);
      if (err.code === 'permission-denied' || err.message?.includes('permission')) {
        setError("Firebase permissions error: Please update your Firestore Security Rules to allow admin access.");
      } else {
        setError("Failed to load admin data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [user]);

  const handleEditUser = (u: UserStats) => {
    setEditingUser(u);
    setManagedKey(u.managedApiKey || '');
    setLimit(u.apiKeyLimit || 100);
    setIsManaged(!!u.isApiKeyManaged);
    setSaveSuccess(false);
  };

  const handleSaveSettings = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    try {
      await db.updateUserAdminSettings(editingUser.uid, {
        managedApiKey: managedKey,
        apiKeyLimit: limit,
        isApiKeyManaged: isManaged
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setEditingUser(null);
        fetchAdminData();
      }, 1500);
    } catch (err) {
      console.error("Failed to update user settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500">Access Denied. You do not have permission to view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500">Loading admin data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200">
          <h2 className="text-lg font-semibold mb-2">Error Loading Dashboard</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const totalUsers = users.length;
  const totalBooks = users.reduce((sum, u) => sum + u.bookCount, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Admin Dashboard</h1>
          <p className="text-zinc-500">System overview and user statistics.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-medium">
          <Shield size={16} />
          Administrator Access
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
            <Database size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Database Location</p>
            <p className="text-lg font-semibold text-zinc-900">Firebase Firestore</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Total Users</p>
            <p className="text-2xl font-bold text-zinc-900">{totalUsers}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
          <div className="bg-purple-50 p-3 rounded-xl text-purple-600">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Total Books Across Platform</p>
            <p className="text-2xl font-bold text-zinc-900">{totalBooks}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">User Management</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Activity size={14} />
            Real-time usage tracking enabled
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-sm text-zinc-600 relative">
            <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">API Status</th>
                <th className="px-6 py-4 font-medium">Usage / Limit</th>
                <th className="px-6 py-4 font-medium">Books</th>
                <th className="px-6 py-4 font-medium">Last Login</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-900">{u.name}</span>
                      <span className="text-xs text-zinc-400">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {u.isApiKeyManaged ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                        <Shield size={10} />
                        Managed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-wider border border-zinc-200">
                        <Users size={10} />
                        Personal
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {u.isApiKeyManaged ? (
                      <div className="flex flex-col gap-1.5 w-32">
                        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500">
                          <span>{u.apiKeyUsage || 0}</span>
                          <span>{u.apiKeyLimit || 0}</span>
                        </div>
                        <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              (u.apiKeyUsage || 0) >= (u.apiKeyLimit || 0) ? 'bg-red-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, ((u.apiKeyUsage || 0) / (u.apiKeyLimit || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-400 italic text-xs">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-700 font-medium">
                      <BookOpen size={14} />
                      {u.bookCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleEditUser(u)}
                      className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                      <SettingsIcon size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-zinc-200"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Manage API Key</h3>
                    <p className="text-xs text-zinc-500">{editingUser.email}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEditingUser(null)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Enable Managed Key</p>
                    <p className="text-xs text-zinc-500">User will use your key instead of theirs</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={isManaged}
                      onChange={(e) => setIsManaged(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <AnimatePresence>
                  {isManaged && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 ml-1">
                          Gemini API Key
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            value={managedKey}
                            onChange={(e) => setManagedKey(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            placeholder="AIzaSy..."
                          />
                          <Key size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 ml-1">
                          Usage Limit (Calls)
                        </label>
                        <input
                          type="number"
                          value={limit}
                          onChange={(e) => setLimit(parseInt(e.target.value))}
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          min="1"
                        />
                      </div>

                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                        <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                          When enabled, the user will not be able to see or change their own API key in their settings. 
                          All their AI requests will use the key provided above.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-6 bg-zinc-50/50 border-t border-zinc-100 flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSaveSettings}
                  disabled={isSaving || saveSuccess}
                >
                  {isSaving ? 'Saving...' : saveSuccess ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={18} />
                      Updated!
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Save size={18} />
                      Save Changes
                    </span>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
