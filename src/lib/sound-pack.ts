// Game-night sound pack. Every cue is synthesised with the Web Audio API
// rather than shipped as an audio asset — keeps the bundle small and
// means the sounds play instantly without a network round-trip on the
// first bust of the night.
//
// Callers pass a `muted` flag rather than reading a global; the live
// game page already owns the mute state, so this module stays
// stateless and pure.

type SoundOptions = { muted?: boolean };

type Note = {
  /** Seconds from "now" to start the note. */
  t: number;
  /** Frequency in Hz. */
  freq: number;
  /** How long the note rings. Default 0.18s. */
  dur?: number;
  /** Peak gain. Default 0.13. */
  gain?: number;
  /** Optional pitch slide multiplier (1 = none, <1 falls, >1 rises). */
  bend?: number;
  /** Oscillator type. Default "sine". */
  type?: OscillatorType;
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

function playSequence(notes: Note[], opts: SoundOptions = {}) {
  if (opts.muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const base = ctx.currentTime;
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? "sine";
      osc.connect(gain);
      gain.connect(ctx.destination);
      const dur = n.dur ?? 0.18;
      const peak = n.gain ?? 0.13;
      const start = base + n.t;
      osc.frequency.setValueAtTime(n.freq, start);
      if (n.bend && n.bend !== 1) {
        osc.frequency.exponentialRampToValueAtTime(n.freq * n.bend, start + dur);
      }
      gain.gain.setValueAtTime(peak, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start);
      osc.stop(start + dur);
    });
  } catch {
    // Browser blocked it (e.g., user hasn't interacted yet) — silently swallow.
  }
}

// =========================================================================
// Sound definitions — each one is a quick descriptive sequence.
// =========================================================================

/** Big bright cascade — used when the blind level expires. */
export function playLevelUpSound(opts?: SoundOptions) {
  playSequence(
    [
      { t: 0,    freq: 880,  bend: 0.6 },
      { t: 0.07, freq: 1100, bend: 0.6 },
      { t: 0.14, freq: 990,  bend: 0.6 },
      { t: 0.22, freq: 1320, bend: 0.6 },
      { t: 0.30, freq: 880,  bend: 0.6 },
    ],
    opts,
  );
}

/** Bust: descending sad two-tone. */
export function playBustSound(opts?: SoundOptions) {
  playSequence(
    [
      { t: 0,    freq: 440, dur: 0.18, bend: 0.5, type: "triangle" },
      { t: 0.16, freq: 220, dur: 0.30, bend: 0.5, type: "triangle" },
    ],
    opts,
  );
}

/** Rebuy: short ka-ching style burst. */
export function playRebuySound(opts?: SoundOptions) {
  playSequence(
    [
      { t: 0,    freq: 1320, dur: 0.10, type: "square", gain: 0.08 },
      { t: 0.05, freq: 1760, dur: 0.14, bend: 0.6, type: "square", gain: 0.08 },
    ],
    opts,
  );
}

/** Finalize: triumphant arpeggio. */
export function playFinalizeSound(opts?: SoundOptions) {
  playSequence(
    [
      { t: 0,    freq: 660 },
      { t: 0.08, freq: 880 },
      { t: 0.16, freq: 990 },
      { t: 0.24, freq: 1320, dur: 0.30 },
    ],
    opts,
  );
}
