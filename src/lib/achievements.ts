// Achievement definitions + evaluator. Pure derivation from a player's
// session history — no Supabase calls, no schema, no admin tooling. Adding
// a new badge is just appending to ACHIEVEMENTS below.
//
// Every rule returns either { unlocked: true, unlockedAt: "<game.date>" } or
// { unlocked: false } plus a `progress` 0..1 number for "you're 60% there"
// hints on locked badges.

import { historicalGames } from "./historical-games";

export type PlayerSession = {
  id: string;
  date: string;
  buyIn: number;
  cashOut: number;
  food: number;
  /** poker net = cashOut − buyIn. Food settles separately. */
  net: number;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  /** lucide-react icon name as a string key; we resolve at render time. */
  iconKey:
    | "Trophy" | "Swords" | "Flame" | "Coins" | "Wallet" | "Timer"
    | "Skull" | "Pizza" | "TrendingUp" | "TrendingDown" | "Star"
    | "Award" | "Sparkles" | "Crown";
  /** Tailwind colour token for the badge body (text + bg accent). */
  theme: "green" | "cyan" | "yellow" | "orange" | "red" | "purple" | "blue";
};

export type EvaluatedAchievement = Achievement & {
  unlocked: boolean;
  unlockedAt: string | null;
  /** 0..1 fraction toward unlock, for locked-badge hints. */
  progress: number;
};

// Each rule receives the player's chronological session list (oldest first)
// and returns { unlocked, unlockedAt, progress }.
type Eval = (
  sessions: PlayerSession[],
) => { unlocked: boolean; unlockedAt: string | null; progress: number };

const evalFirstBlood: Eval = (s) => {
  if (s.length === 0) return { unlocked: false, unlockedAt: null, progress: 0 };
  const first = s[0];
  return first.net >= 0
    ? { unlocked: true, unlockedAt: first.date, progress: 1 }
    : { unlocked: false, unlockedAt: null, progress: 0 };
};

function runStreak(sessions: PlayerSession[], length: number): { unlocked: boolean; unlockedAt: string | null; progress: number } {
  let run = 0;
  let best = 0;
  let unlockedAt: string | null = null;
  for (const sess of sessions) {
    if (sess.net >= 0) {
      run += 1;
      if (run > best) best = run;
      if (run === length && !unlockedAt) unlockedAt = sess.date;
    } else {
      run = 0;
    }
  }
  return {
    unlocked: best >= length,
    unlockedAt,
    progress: Math.min(1, best / length),
  };
}

const evalHatTrick: Eval = (s) => runStreak(s, 3);
const evalFiveTimer: Eval = (s) => runStreak(s, 5);

const evalBigSpender: Eval = (s) => {
  const hit = s.find((x) => x.buyIn >= 50);
  return {
    unlocked: Boolean(hit),
    unlockedAt: hit?.date ?? null,
    progress: Math.min(1, (Math.max(0, ...s.map((x) => x.buyIn)) || 0) / 50),
  };
};

const evalHighRoller: Eval = (s) => {
  let running = 0;
  let hitAt: string | null = null;
  for (const sess of s) {
    running += sess.buyIn;
    if (running >= 500 && !hitAt) hitAt = sess.date;
  }
  return {
    unlocked: running >= 500,
    unlockedAt: hitAt,
    progress: Math.min(1, running / 500),
  };
};

const evalIronStomach: Eval = (s) => ({
  unlocked: s.length >= 10,
  unlockedAt: s[9]?.date ?? null,
  progress: Math.min(1, s.length / 10),
});

const evalCenturion: Eval = (s) => ({
  unlocked: s.length >= 25,
  unlockedAt: s[24]?.date ?? null,
  progress: Math.min(1, s.length / 25),
});

const evalInTheBlack: Eval = (s) => {
  if (s.length < 5) {
    return { unlocked: false, unlockedAt: null, progress: Math.min(1, s.length / 5) };
  }
  const total = s.reduce((sum, x) => sum + x.net, 0);
  return {
    unlocked: total > 0,
    unlockedAt: total > 0 ? s[s.length - 1].date : null,
    progress: total > 0 ? 1 : 0,
  };
};

const evalComebackKid: Eval = (s) => {
  if (s.length < 5) {
    return { unlocked: false, unlockedAt: null, progress: Math.min(1, s.length / 5) };
  }
  const first = s[0];
  if (first.net >= 0) return { unlocked: false, unlockedAt: null, progress: 0 };
  const total = s.reduce((sum, x) => sum + x.net, 0);
  return {
    unlocked: total > 0,
    unlockedAt: total > 0 ? s[s.length - 1].date : null,
    progress: total > 0 ? 1 : 0,
  };
};

const evalFoodie: Eval = (s) => {
  let running = 0;
  let hitAt: string | null = null;
  for (const sess of s) {
    running += sess.food;
    if (running >= 50 && !hitAt) hitAt = sess.date;
  }
  return {
    unlocked: running >= 50,
    unlockedAt: hitAt,
    progress: Math.min(1, running / 50),
  };
};

const evalTank: Eval = (s) => {
  let run = 0;
  let best = 0;
  let unlockedAt: string | null = null;
  for (const sess of s) {
    if (sess.net < 0) {
      run += 1;
      if (run > best) best = run;
      if (run === 3 && !unlockedAt) unlockedAt = sess.date;
    } else {
      run = 0;
    }
  }
  return { unlocked: best >= 3, unlockedAt, progress: Math.min(1, best / 3) };
};

export const ACHIEVEMENTS: (Achievement & { evaluate: Eval })[] = [
  {
    id: "first-blood",
    name: "First Blood",
    description: "Win your first ever session.",
    iconKey: "Trophy",
    theme: "yellow",
    evaluate: evalFirstBlood,
  },
  {
    id: "hat-trick",
    name: "Hat Trick",
    description: "Win three sessions in a row.",
    iconKey: "Flame",
    theme: "orange",
    evaluate: evalHatTrick,
  },
  {
    id: "five-timer",
    name: "Five-Timer",
    description: "Win five sessions in a row.",
    iconKey: "Sparkles",
    theme: "purple",
    evaluate: evalFiveTimer,
  },
  {
    id: "big-spender",
    name: "Big Spender",
    description: "Buy in for £50 or more in a single session.",
    iconKey: "Coins",
    theme: "cyan",
    evaluate: evalBigSpender,
  },
  {
    id: "high-roller",
    name: "High Roller",
    description: "Push £500 of buy-ins across the table over your career.",
    iconKey: "Wallet",
    theme: "cyan",
    evaluate: evalHighRoller,
  },
  {
    id: "iron-stomach",
    name: "Iron Stomach",
    description: "Play 10 tracked sessions.",
    iconKey: "Timer",
    theme: "blue",
    evaluate: evalIronStomach,
  },
  {
    id: "centurion",
    name: "Centurion",
    description: "Play 25 tracked sessions.",
    iconKey: "Crown",
    theme: "yellow",
    evaluate: evalCenturion,
  },
  {
    id: "in-the-black",
    name: "In The Black",
    description: "Stay net-positive lifetime after 5+ sessions.",
    iconKey: "TrendingUp",
    theme: "green",
    evaluate: evalInTheBlack,
  },
  {
    id: "comeback-kid",
    name: "Comeback Kid",
    description: "Lose your first session, but turn it around to net-positive after 5+ sessions.",
    iconKey: "Award",
    theme: "purple",
    evaluate: evalComebackKid,
  },
  {
    id: "foodie",
    name: "Foodie",
    description: "Eat £50 worth of game-night food over your career.",
    iconKey: "Pizza",
    theme: "orange",
    evaluate: evalFoodie,
  },
  {
    id: "the-tank",
    name: "The Tank",
    description: "Lose three sessions in a row.",
    iconKey: "Skull",
    theme: "red",
    evaluate: evalTank,
  },
];

/**
 * Build the chronological sessions list for a player (oldest first) and
 * run every rule against it. Returns the full set so the UI can render
 * locked badges too.
 */
export function evaluatePlayerAchievements(playerName: string): EvaluatedAchievement[] {
  const lower = playerName.toLowerCase();
  const sessions: PlayerSession[] = [];
  // historicalGames is most-recent-first; reverse so the rules see oldest first.
  for (const g of [...historicalGames].reverse()) {
    const me = g.players.find((p) => p.name.toLowerCase() === lower);
    if (!me) continue;
    sessions.push({
      id: g.id,
      date: g.date,
      buyIn: me.buyIn,
      cashOut: me.cashOut,
      food: me.food,
      net: me.cashOut - me.buyIn,
    });
  }

  return ACHIEVEMENTS.map(({ evaluate, ...meta }) => {
    const result = evaluate(sessions);
    return { ...meta, ...result };
  });
}
