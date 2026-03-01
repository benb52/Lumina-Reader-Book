import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { db } from '../lib/db';
import { Database, Users, BookOpen, Activity } from 'lucide-react';

interface UserStats {
  uid: string;
  email: string;
  name: string;
  lastLogin: number;
  bookCount: number;
}

export default function AdminDashboard() {
  const user = useStore((state) => state.user);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdminData = async () => {
      if (user?.email !== 'shakedbenb@gmail.com') return;

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

    fetchAdminData();
  }, [user]);

  if (user?.email !== 'shakedbenb@gmail.com') {
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
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Admin Dashboard</h1>
        <p className="text-zinc-500">System overview and user statistics.</p>
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
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">User Statistics</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-600">
            <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Books</th>
                <th className="px-6 py-4 font-medium">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900">{u.name}</td>
                  <td className="px-6 py-4">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-700 font-medium">
                      <BookOpen size={14} />
                      {u.bookCount}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
