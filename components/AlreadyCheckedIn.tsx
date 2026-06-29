'use client';

import { useEffect } from 'react';
import { Delegate } from '@/types/delegate';
import { playError } from '@/lib/sounds';

interface AlreadyCheckedInProps {
  delegate: Delegate;
  onClose: () => void;
}

export default function AlreadyCheckedIn({ delegate, onClose }: AlreadyCheckedInProps) {
  useEffect(() => {
    playError();
  }, []);

  return (
    <div className="result-screen animate-slide-up">
      {/* Status badge */}
      <div className="flex items-center justify-center mb-6">
        <div className="flex items-center gap-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl px-6 py-3">
          <span className="text-amber-400 text-2xl">⚠</span>
          <span className="text-amber-400 font-bold text-xl tracking-wide">Already Checked In</span>
        </div>
      </div>

      {/* Delegate info */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 mb-5 space-y-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Name</span>
          <span className="text-xl font-bold text-white">{delegate.name}</span>
        </div>
        <div className="border-t border-slate-700/50" />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Committee</span>
          <span className="text-slate-200">{delegate.committee}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Portfolio</span>
          <span className="text-slate-200">{delegate.portfolio}</span>
        </div>
      </div>

      {/* Check-in timestamp */}
      <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 mb-5">
        <p className="text-xs text-amber-500/70 uppercase tracking-widest mb-1">Checked In At</p>
        <p className="text-amber-300 font-semibold text-lg">
          {delegate.checkInTime ?? 'Unknown time'}
        </p>
        {delegate.device && (
          <>
            <p className="text-xs text-amber-500/70 uppercase tracking-widest mt-3 mb-1">Device</p>
            <p className="text-slate-400 text-xs font-mono leading-relaxed break-all">
              {delegate.device}
            </p>
          </>
        )}
      </div>

      <p className="text-slate-500 text-sm text-center mb-5">
        No changes have been made to the attendance record.
      </p>

      <button
        onClick={onClose}
        className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg rounded-xl transition-all duration-200 active:scale-95"
      >
        Close &amp; Scan Next
      </button>
    </div>
  );
}
