import React from 'react';
import { useStore } from '../store/useStore';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/db';

export default function QuotaWarning() {
  const isWaitingForQuota = useStore((state) => state.isWaitingForQuota);
  const isFirestoreOffline = useStore((state) => state.isFirestoreOffline);
  const setIsFirestoreOffline = useStore((state) => state.setIsFirestoreOffline);
  const user = useStore((state) => state.user);

  const handleRetryFirestore = async () => {
    if (!user) return;
    try {
      // Try a simple read to check connectivity
      await db.getUserMetadata(user.uid);
      setIsFirestoreOffline(false);
    } catch (e) {
      console.log("Firestore still offline");
    }
  };

  return (
    <AnimatePresence>
      {(isWaitingForQuota || isFirestoreOffline) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`${isFirestoreOffline ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border-b overflow-hidden`}
        >
          <div className={`max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 ${isFirestoreOffline ? 'text-red-800' : 'text-amber-800'} text-sm font-medium`}>
            <AlertTriangle size={16} className={`${isFirestoreOffline ? 'text-red-600' : 'text-amber-600'} shrink-0`} />
            <span>
              {isFirestoreOffline 
                ? "Firestore is currently offline. Your data is being saved locally and will sync when back online." 
                : "Gemini API quota reached. Waiting for a moment to retry automatically..."}
            </span>
            {isFirestoreOffline ? (
              <button 
                onClick={handleRetryFirestore}
                className="flex items-center gap-1 px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
              >
                <RefreshCw size={12} />
                Retry
              </button>
            ) : (
              <Loader2 size={14} className="animate-spin text-amber-600" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
