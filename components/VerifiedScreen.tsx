'use client';

import { useEffect, useState } from 'react';
import { Delegate } from '@/types/delegate';
import { playSuccess } from '@/lib/sounds';

interface VerifiedScreenProps {
  delegate: Delegate;
  onClose: () => void;
}

export default function VerifiedScreen({ delegate, onClose }: VerifiedScreenProps) {
  const isPaid = delegate.feeStatus.toLowerCase() === 'paid';
  const [attendanceRecorded, setAttendanceRecorded] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Auto-record attendance for paid delegates
  useEffect(() => {
    if (isPaid) {
      recordAttendance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recordAttendance() {
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: delegate.uuid }),
      });
      if (res.ok || res.status === 409) {
        playSuccess();
        setAttendanceRecorded(true);
      } else {
        const data = await res.json();
        setAttendanceError(data.error ?? 'Failed to record attendance.');
      }
    } catch {
      setAttendanceError('Network error — could not record attendance.');
    } finally {
      setAttendanceLoading(false);
    }
  }

  return (
    <div className="result-screen animate-slide-up">
      {/* Status badge */}
      <div className="flex items-center justify-center mb-6">
        <div className="flex items-center gap-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl px-6 py-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
            ✓
          </div>
          <span className="text-emerald-400 font-bold text-2xl tracking-wide">VERIFIED</span>
        </div>
      </div>

      {/* Delegate info card */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 mb-5 space-y-3">
        <InfoRow label="Name" value={delegate.name} large />
        <Divider />
        <InfoRow label="Committee" value={delegate.committee} />
        <InfoRow label="Portfolio" value={delegate.portfolio} />
        <Divider />
        <InfoRow label="Fee Status" value={delegate.feeStatus} highlight={isPaid ? 'paid' : 'unpaid'} />
        <Divider />
        <InfoRow label="Contact" value={delegate.contact} />
        <InfoRow label="Email" value={delegate.email} mono />
      </div>

      {/* Fee status section */}
      {!isPaid && !attendanceRecorded && (
        <div className="bg-amber-900/30 border border-amber-500/40 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400 text-xl">⚠</span>
            <span className="text-amber-400 font-bold text-lg">Fee Pending</span>
          </div>
          <p className="text-slate-300 text-sm mb-4">
            This delegate has not paid the registration fee. Press the button below only after collecting payment.
          </p>
          {attendanceError && (
            <p className="text-red-400 text-sm mb-3">{attendanceError}</p>
          )}
          <button
            onClick={recordAttendance}
            disabled={attendanceLoading}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-900 font-bold text-lg rounded-xl transition-all duration-200 active:scale-95"
          >
            {attendanceLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                Recording…
              </span>
            ) : (
              'Validate Entry'
            )}
          </button>
        </div>
      )}

      {/* Attendance confirmed */}
      {attendanceRecorded && (
        <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/40 rounded-xl px-4 py-3 mb-5">
          <span className="text-emerald-400 text-xl">✓</span>
          <span className="text-emerald-400 font-semibold">Attendance recorded</span>
        </div>
      )}

      {/* Auto-recording spinner */}
      {isPaid && attendanceLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-5">
          <span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          Recording attendance…
        </div>
      )}

      {attendanceError && isPaid && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3 mb-5">
          <p className="text-red-400 text-sm">{attendanceError}</p>
          <button
            onClick={recordAttendance}
            className="mt-2 text-sm text-red-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg rounded-xl transition-all duration-200 active:scale-95"
      >
        Close &amp; Scan Next
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  large,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  large?: boolean;
  mono?: boolean;
  highlight?: 'paid' | 'unpaid';
}) {
  const valueClass = [
    large ? 'text-xl font-bold text-white' : 'text-base text-slate-200',
    mono ? 'font-mono text-sm' : '',
    highlight === 'paid' ? 'text-emerald-400 font-semibold' : '',
    highlight === 'unpaid' ? 'text-amber-400 font-semibold' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={valueClass}>{value || '—'}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-700/50 my-1" />;
}
