'use client';

export default function LoadingScreen() {
  return (
    <div className="result-screen animate-fade-in flex flex-col items-center justify-center py-16">
      <div className="relative mb-6">
        <div className="w-16 h-16 border-4 border-violet-500/30 rounded-full" />
        <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
      </div>
      <p className="text-slate-300 font-medium text-lg">Looking up delegate…</p>
      <p className="text-slate-500 text-sm mt-2">Checking Google Sheets</p>
    </div>
  );
}
