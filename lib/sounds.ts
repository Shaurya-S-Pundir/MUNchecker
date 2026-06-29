/**
 * Generates success and error sounds using the Web Audio API.
 * No audio files required.
 */

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

export function playSuccess(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Pleasant ascending chime: C5 → E5 → G5
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);

    gainNode.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.12 + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);

    oscillator.start(ctx.currentTime + i * 0.12);
    oscillator.stop(ctx.currentTime + i * 0.12 + 0.35);
  });
}

export function playError(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Short descending buzz
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(300, ctx.currentTime);
  oscillator.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.3);

  gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.4);
}
