'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { DelegateApiResponse } from '@/types/delegate';
import LoadingScreen from '@/components/LoadingScreen';
import VerifiedScreen from '@/components/VerifiedScreen';
import AlreadyCheckedIn from '@/components/AlreadyCheckedIn';
import InvalidQR from '@/components/InvalidQR';

// Dynamically import Scanner (uses browser APIs — no SSR)
const Scanner = dynamic(() => import('@/components/Scanner'), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-sm mx-auto aspect-square bg-slate-900 rounded-2xl flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

type AppState =
  | { screen: 'scanner' }
  | { screen: 'loading' }
  | { screen: 'result'; data: DelegateApiResponse }
  | { screen: 'error'; message: string };

export default function HomePage() {
  const [state, setState] = useState<AppState>({ screen: 'scanner' });

  const handleScanResult = useCallback((result: DelegateApiResponse) => {
    setState({ screen: 'result', data: result });
  }, []);

  const handleScanError = useCallback((message: string) => {
    setState({ screen: 'error', message });
  }, []);

  const handleClose = useCallback(() => {
    setState({ screen: 'scanner' });
  }, []);

  const isScannerActive = state.screen === 'scanner';

  return (
    <main className="min-h-dvh bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-slate-950/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">MUN Scanner</h1>
            <p className="text-slate-500 text-xs">Delegate Verification</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isScannerActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}
          />
          <span className="text-xs text-slate-500">
            {isScannerActive ? 'Live' : 'Paused'}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col px-4 py-6 max-w-lg mx-auto w-full">
        {/* Scanner is always mounted; visibility toggled via `active` prop */}
        <div className={state.screen !== 'scanner' ? 'hidden' : ''}>
          <Scanner
            onResult={handleScanResult}
            onError={handleScanError}
            active={isScannerActive}
          />
        </div>

        {/* Loading */}
        {state.screen === 'loading' && <LoadingScreen />}

        {/* Results */}
        {state.screen === 'result' && (() => {
          const { data } = state;
          switch (data.status) {
            case 'verified':
            case 'already_checked_in':
              if (data.status === 'already_checked_in' && data.delegate) {
                return (
                  <AlreadyCheckedIn delegate={data.delegate} onClose={handleClose} />
                );
              }
              if (data.delegate) {
                return (
                  <VerifiedScreen delegate={data.delegate} onClose={handleClose} />
                );
              }
              return null;

            case 'invalid':
              return <InvalidQR onClose={handleClose} />;

            case 'error':
              return (
                <div className="result-screen animate-slide-up">
                  <div className="flex flex-col items-center gap-4 py-12">
                    <div className="w-16 h-16 bg-red-500/20 border-2 border-red-500/40 rounded-full flex items-center justify-center">
                      <span className="text-red-400 text-2xl">!</span>
                    </div>
                    <h2 className="text-white font-bold text-xl">Server Error</h2>
                    <p className="text-slate-400 text-sm text-center leading-relaxed">
                      {data.message ?? 'An unexpected error occurred.'}
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg rounded-xl transition-all duration-200 active:scale-95"
                  >
                    Close &amp; Retry
                  </button>
                </div>
              );

            default:
              return null;
          }
        })()}

        {/* Network error */}
        {state.screen === 'error' && (
          <div className="result-screen animate-slide-up">
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-16 h-16 bg-orange-500/20 border-2 border-orange-500/40 rounded-full flex items-center justify-center">
                <span className="text-orange-400 text-2xl">⚡</span>
              </div>
              <h2 className="text-white font-bold text-xl">Network Error</h2>
              <p className="text-slate-400 text-sm text-center leading-relaxed">
                {state.message}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg rounded-xl transition-all duration-200 active:scale-95"
            >
              Close &amp; Retry
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
