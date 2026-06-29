'use client';

import { useEffect } from 'react';
import { playError } from '@/lib/sounds';

interface InvalidQRProps {
  onClose: () => void;
}

export default function InvalidQR({ onClose }: InvalidQRProps) {
  useEffect(() => {
    playError();
  }, []);

  return (
    <div className="result-screen animate-slide-up">
      {/* Status badge */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 bg-red-500/20 border-2 border-red-500/50 rounded-full flex items-center justify-center">
            <span className="text-red-400 text-4xl font-bold">✕</span>
          </div>
          <span className="text-red-400 font-bold text-2xl tracking-wide">Invalid QR Code</span>
        </div>
      </div>

      <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-5 mb-8 text-center">
        <p className="text-slate-300 leading-relaxed">
          The scanned QR code does not match any registered delegate.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          No changes have been made to the attendance records.
        </p>
      </div>

      <button
        onClick={onClose}
        className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg rounded-xl transition-all duration-200 active:scale-95"
      >
        Close &amp; Try Again
      </button>
    </div>
  );
}
