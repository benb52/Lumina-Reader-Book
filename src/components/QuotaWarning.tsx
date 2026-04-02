import React from 'react';
import { useStore } from '../store/useStore';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function QuotaWarning() {
  const isWaitingForQuota = useStore((state) => state.isWaitingForQuota);

  return (
    <AnimatePresence>
      {isWaitingForQuota && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-amber-50 border-b border-amber-200 overflow-hidden"
        >
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 text-amber-800 text-sm font-medium">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>Gemini API quota reached. Waiting for a moment to retry automatically...</span>
            <Loader2 size={14} className="animate-spin text-amber-600" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
