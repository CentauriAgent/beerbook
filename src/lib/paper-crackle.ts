/**
 * Subtle paper crinkle/crackle synthesized with Web Audio — no audio files.
 *
 * Short filtered white-noise micro-bursts (bandpass ~2–6 kHz, Q ~0.9) with
 * very fast attack/decay envelopes, staggered so the total event stays under
 * ~300 ms. Gain is kept low (~0.15 peak) so it reads as paper, not static.
 *
 * The AudioContext is created lazily on first call — only ever call this from
 * a user-gesture handler (pointerup / keydown / click) so autoplay policies
 * allow it.
 */

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = Math.floor(c.sampleRate * 0.3);
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/**
 * Play a paper crinkle.
 * @param intensity 1 = full turn-commit crinkle, ~0.5 = quieter snap-back.
 */
export function playPaperCrackle(intensity = 1): void {
  const c = getCtx();
  if (!c || intensity <= 0) return;

  const now = c.currentTime;
  const bursts = 3 + Math.floor(Math.random() * 3); // 3–5 micro-bursts

  for (let i = 0; i < bursts; i++) {
    const start = now + i * (0.025 + Math.random() * 0.03); // staggered, <300ms total
    const decay = 0.045 + Math.random() * 0.045;

    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    src.playbackRate.value = 0.9 + Math.random() * 0.3;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000 + Math.random() * 4000; // 2–6 kHz crinkle band
    bp.Q.value = 0.9;

    const g = c.createGain();
    const peak = Math.max(0.0002, 0.15 * intensity * (0.6 + Math.random() * 0.4));
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.004); // fast attack
    g.gain.exponentialRampToValueAtTime(0.0001, start + decay); // quick decay

    src.connect(bp).connect(g).connect(c.destination);
    const offset = Math.random() * 0.1;
    src.start(start, offset);
    src.stop(start + decay + 0.05);
  }
}
