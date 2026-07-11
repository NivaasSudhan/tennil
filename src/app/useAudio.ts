/**
 * useAudio — WebAudio-synthesized broadcast stings (DESIGN.md Audio).
 * Zero binary assets, zero licensing, zero persistence: muted by default, a
 * visible broadcast-chrome toggle owns the on/off state as PER-SESSION React
 * state only (ADR-010 — no localStorage, ever). Nothing gameplay-relevant is
 * audio-only (PRODUCT.md Accessibility).
 *
 * Stings exposed: whistle (kickoff / full-time: two square-wave chirps), and
 * goal roar (shaped pink-noise swell, ~600ms). An AudioContext is created lazily
 * on the first user-initiated toggle so we never construct one before a gesture
 * (autoplay policy) and never hold one if audio is left muted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioApi {
  muted: boolean;
  toggleMuted: () => void;
  playWhistle: () => void;
  playRoar: () => void;
}

export function useAudio(): AudioApi {
  const [muted, setMuted] = useState(true);
  const ctxRef = useRef<AudioContext | null>(null);

  // Tear down the AudioContext on unmount. No state is persisted anywhere.
  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  const ensureContext = useCallback((): AudioContext | null => {
    if (muted) return null;
    if (ctxRef.current) return ctxRef.current;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    // Resume if the browser started it suspended (e.g. created pre-gesture).
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }, [muted]);

  const playWhistle = useCallback(() => {
    const ctx = ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two square-wave chirps, dropping pitch (referee).
    [880, 620].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.16);
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.16 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.14);
    });
  }, [ensureContext]);

  const playRoar = useCallback(() => {
    const ctx = ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.6;

    // Pink-ish noise buffer (shaped crowd roar swell).
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < frames; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      data[i] = pink;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Band-pass to crowd range + 600ms swell (attack 60ms, decay to -40dB).
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.06);
    gain.gain.setValueAtTime(0.5, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }, [ensureContext]);

  return {
    muted,
    toggleMuted: () => setMuted((m) => !m),
    playWhistle,
    playRoar,
  };
}