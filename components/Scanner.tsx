'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { DelegateApiResponse } from '@/types/delegate';

interface ScannerProps {
  onResult: (result: DelegateApiResponse) => void;
  onError: (error: string) => void;
  active: boolean;
}

export default function Scanner({ onResult, onError, active }: ScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const isRunningRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current && isRunningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        isRunningRef.current = false;
      } catch {
        // ignore stop errors
      }
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || isRunningRef.current) return;

    const { Html5Qrcode } = await import('html5-qrcode');

    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode('qr-reader');
    }

    try {
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        async (decodedText) => {
          if (!isRunningRef.current) return;

          // Pause immediately to avoid double-scans
          await stopScanner();

          try {
            const response = await fetch(
              `/api/delegate/${encodeURIComponent(decodedText.trim())}`
            );
            const data: DelegateApiResponse = await response.json();
            onResult(data);
          } catch {
            onError('Network error — could not reach the server. Please try again.');
          }
        },
        undefined // quiet errors for unrecognised QR frames
      );
      isRunningRef.current = true;
      setIsLoading(false);
      setCameraError(null);
    } catch (err) {
      setIsLoading(false);
      const message =
        err instanceof Error ? err.message : 'Failed to start camera.';
      if (
        message.toLowerCase().includes('permission') ||
        message.toLowerCase().includes('denied')
      ) {
        setCameraError(
          'Camera permission denied. Please allow camera access in your browser settings and reload.'
        );
      } else if (message.toLowerCase().includes('not found')) {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera error: ${message}`);
      }
    }
  }, [onResult, onError, stopScanner]);

  // Start/stop based on `active` prop
  useEffect(() => {
    if (active) {
      setIsLoading(true);
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [active, startScanner, stopScanner]);

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Scanner viewport */}
      <div
        className="relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-black"
        style={{ aspectRatio: '1/1' }}
      >
        <div id="qr-reader" ref={scannerRef} className="w-full h-full" />

        {/* Scan frame overlay */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-52 h-52">
              {/* Corner accents */}
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-violet-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-violet-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-violet-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-violet-400 rounded-br-lg" />
              {/* Scan line */}
              {active && !isLoading && (
                <span className="absolute left-2 right-2 h-0.5 bg-violet-400 opacity-80 scan-line" />
              )}
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && !cameraError && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-violet-300 text-sm font-medium">Starting camera…</p>
          </div>
        )}
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="mt-6 mx-4 p-4 bg-red-900/40 border border-red-500/50 rounded-xl text-center">
          <p className="text-red-300 text-sm leading-relaxed">{cameraError}</p>
          <button
            onClick={() => {
              setCameraError(null);
              setIsLoading(true);
              startScanner();
            }}
            className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Hint text */}
      {!cameraError && !isLoading && (
        <p className="mt-4 text-slate-400 text-sm text-center">
          Point camera at delegate QR code
        </p>
      )}
    </div>
  );
}
