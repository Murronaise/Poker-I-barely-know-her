// Game-night sound pack. Each cue is a real audio file shipped from
// `/public/sounds/` (sourced from mixkit.co under their free license) —
// the synth tones we previously used were thin and Game-Boy-ish, so they
// got swapped for proper recorded chips/cheers/sad-piano hits.
//
// Callers pass a `muted` flag rather than reading a global; the live
// game page already owns the mute state, so this module stays
// stateless aside from a tiny audio-element cache used to avoid
// re-fetching the same file on every play.

type SoundOptions = { muted?: boolean };

const SOUND_SRC = {
  buyin: "/sounds/buyin.mp3",     // chip/coin clink — buy-ins and rebuys
  bust: "/sounds/bust.mp3",       // short losing piano — player out
  level: "/sounds/levelup.mp3",   // achievement bling — blinds advance
  finalize: "/sounds/finalize.mp3", // jackpot fanfare — game ends
  start: "/sounds/start.mp3",     // card-deck shuffle — session starts
  cashout: "/sounds/cashout.mp3", // short video-game win — cashed out in profit
  mismatch: "/sounds/mismatch.mp3", // game-show buzzer — chip mismatch alert
  undo: "/sounds/undo.mp3",       // light-switch tap — undo bust
} as const;

type SoundKey = keyof typeof SOUND_SRC;

// Mixkit "preview" mp3s aren't the bare sound effect — they bundle the
// useful hit (1-2s) with silence and sometimes a brand watermark, so the
// raw files run 4-18s. We hard-cap each clip to just its useful slice
// here so the cues don't overlap into a 30-second wall of noise. Tuned
// by ear; bump up if a cue gets clipped before its tail decays.
const MAX_DURATION_S: Record<SoundKey, number> = {
  buyin: 0.45,
  bust: 1.3,
  level: 1.5,
  finalize: 2.2,
  start: 1.2,
  cashout: 1.4,
  mismatch: 0.9,
  undo: 0.25, // entire clip is 0.18s — small slack
};

// One "primed" audio element per cue. We clone it on every play so a
// rapid back-to-back fire (two rebuys in 200ms) doesn't cut off the
// previous one — HTMLAudioElement only plays one position at a time,
// but a fresh clone shares the cached source data so there's no extra
// network round-trip.
const primed: Partial<Record<SoundKey, HTMLAudioElement>> = {};

function play(key: SoundKey, opts: SoundOptions, volume: number) {
  if (opts.muted) return;
  if (typeof window === "undefined") return;
  try {
    let base = primed[key];
    if (!base) {
      base = new Audio(SOUND_SRC[key]);
      base.preload = "auto";
      primed[key] = base;
    }
    const el = base.cloneNode(true) as HTMLAudioElement;
    el.volume = volume;
    const cap = MAX_DURATION_S[key];
    // Belt-and-braces clip cutoff: timeupdate fires roughly every
    // 50-250ms and gives us tight-ish accuracy; the setTimeout is a
    // hard backstop for browsers that throttle timeupdate when the
    // tab is backgrounded. Whichever fires first stops the clip.
    const stop = () => {
      try {
        el.pause();
      } catch {/* already stopped */}
    };
    const onTime = () => {
      if (el.currentTime >= cap) {
        el.removeEventListener("timeupdate", onTime);
        stop();
      }
    };
    el.addEventListener("timeupdate", onTime);
    const backstop = window.setTimeout(stop, Math.ceil(cap * 1000) + 50);
    el.addEventListener("ended", () => window.clearTimeout(backstop));
    // `.play()` returns a promise that rejects if the browser blocks
    // autoplay (no user gesture yet). Swallow — the first click on the
    // page satisfies the gesture requirement and subsequent plays work.
    void el.play().catch(() => {
      window.clearTimeout(backstop);
    });
  } catch {
    // Audio constructor or play() blew up — silently swallow rather
    // than crash the live-game page over a sound effect.
  }
}

/**
 * Optional warm-up — call once on the live-game page mount so the
 * browser fetches and decodes the files before the first cue fires.
 * Without this the very first rebuy of the night has a noticeable
 * "tap then silence then sound" lag while the file loads.
 */
export function preloadGameSounds() {
  if (typeof window === "undefined") return;
  (Object.keys(SOUND_SRC) as SoundKey[]).forEach((k) => {
    if (!primed[k]) {
      const a = new Audio(SOUND_SRC[k]);
      a.preload = "auto";
      primed[k] = a;
    }
  });
}

/** Big bright cascade — used when the blind level expires. */
export function playLevelUpSound(opts?: SoundOptions) {
  play("level", opts ?? {}, 0.5);
}

/** Bust: short sad piano. */
export function playBustSound(opts?: SoundOptions) {
  play("bust", opts ?? {}, 0.55);
}

/** Rebuy / buy-in: chip clink. */
export function playRebuySound(opts?: SoundOptions) {
  play("buyin", opts ?? {}, 0.5);
}

/** Finalize: triumphant jackpot fanfare. */
export function playFinalizeSound(opts?: SoundOptions) {
  play("finalize", opts ?? {}, 0.55);
}

/** Game start: card-deck shuffle. */
export function playStartSound(opts?: SoundOptions) {
  play("start", opts ?? {}, 0.5);
}

/** Cash-out in profit: short video-game win sting. */
export function playCashOutSound(opts?: SoundOptions) {
  play("cashout", opts ?? {}, 0.5);
}

/** Chip mismatch alert: classic game-show buzzer. */
export function playMismatchSound(opts?: SoundOptions) {
  play("mismatch", opts ?? {}, 0.45);
}

/** Undo: light-switch tap. */
export function playUndoSound(opts?: SoundOptions) {
  play("undo", opts ?? {}, 0.5);
}

