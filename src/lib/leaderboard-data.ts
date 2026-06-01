import { type HistoricalGame } from "./historical-games";
import { formatCurrency } from "./format";

export type LeaderboardRow = {
  rank: number;
  player: string;
  value: string;
  winRate: string;
  sessions: number;
  positive?: boolean;
  trendDirection?: "up" | "down" | "flat";
};

export type LeaderboardCategory = {
  slug: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  rows: LeaderboardRow[];
};

// Stats are computed from src/lib/historical-games.ts. "Net" everywhere is
// poker net only (cash-out minus buy-in) — food is settled separately to the
// food payer (see local-store.ts FOOD_PAYER) and never folded into a player's
// headline numbers.
export const leaderboardCategories: Record<string, LeaderboardCategory> = {
  "overall-leader": {
    slug: "overall-leader",
    title: "Money Printer",
    subtitle: "The biggest all-time winner.",
    metricLabel: "Profit",
    rows: [
      { rank: 1, player: "Jake", value: "+£56.65", winRate: "100%", sessions: 2, positive: true, trendDirection: "up" },
      { rank: 2, player: "Tony", value: "+£42.50", winRate: "100%", sessions: 1, positive: true, trendDirection: "flat" },
      { rank: 3, player: "Toby", value: "+£31.20", winRate: "75%", sessions: 4, positive: true, trendDirection: "up" },
      { rank: 4, player: "Connor", value: "+£27.80", winRate: "100%", sessions: 2, positive: true, trendDirection: "up" },
      { rank: 5, player: "Liam", value: "+£2.00", winRate: "100%", sessions: 1, positive: true, trendDirection: "flat" },
      { rank: 6, player: "Kai", value: "-£32.30", winRate: "50%", sessions: 4, positive: false, trendDirection: "down" },
      { rank: 7, player: "Harry", value: "-£52.45", winRate: "33%", sessions: 3, positive: false, trendDirection: "down" },
      { rank: 8, player: "Tristan", value: "-£75.40", winRate: "50%", sessions: 4, positive: false, trendDirection: "down" },
    ],
  },
  "the-shark": {
    slug: "the-shark",
    title: "Probably Cheating",
    subtitle: "Wins so consistently it raises eyebrows.",
    metricLabel: "Win Rate",
    rows: [
      { rank: 1, player: "Connor", value: "100%", winRate: "100%", sessions: 2, positive: true },
      { rank: 2, player: "Jake", value: "100%", winRate: "100%", sessions: 2, positive: true },
      { rank: 3, player: "Tony", value: "100%", winRate: "100%", sessions: 1, positive: true },
      { rank: 4, player: "Liam", value: "100%", winRate: "100%", sessions: 1, positive: true },
      { rank: 5, player: "Toby", value: "75%", winRate: "75%", sessions: 4, positive: true },
      { rank: 6, player: "Kai", value: "50%", winRate: "50%", sessions: 4, positive: true },
      { rank: 7, player: "Tristan", value: "50%", winRate: "50%", sessions: 4, positive: true },
      { rank: 8, player: "Harry", value: "33%", winRate: "33%", sessions: 3, positive: false },
    ],
  },
  "the-whale": {
    slug: "the-whale",
    title: "Mortgage Material",
    subtitle: "Has pushed the most chips across the table.",
    metricLabel: "Total Invested",
    rows: [
      { rank: 1, player: "Tristan", value: "£170.00", winRate: "50%", sessions: 4, positive: true },
      { rank: 2, player: "Harry", value: "£105.00", winRate: "33%", sessions: 3, positive: true },
      { rank: 3, player: "Kai", value: "£100.00", winRate: "50%", sessions: 4, positive: true },
      { rank: 4, player: "Toby", value: "£100.00", winRate: "75%", sessions: 4, positive: true },
      { rank: 5, player: "Jake", value: "£50.00", winRate: "100%", sessions: 2, positive: true },
      { rank: 6, player: "Connor", value: "£45.00", winRate: "100%", sessions: 2, positive: true },
      { rank: 7, player: "Tony", value: "£25.00", winRate: "100%", sessions: 1, positive: true },
      { rank: 8, player: "Liam", value: "£20.00", winRate: "100%", sessions: 1, positive: true },
    ],
  },
  "the-tank": {
    slug: "the-tank",
    title: "The Pit",
    subtitle: "Took the worst beating in a single night.",
    metricLabel: "Worst Loss",
    rows: [
      { rank: 1, player: "Tristan", value: "-£75.00", winRate: "50%", sessions: 4, positive: false },
      { rank: 2, player: "Harry", value: "-£42.30", winRate: "33%", sessions: 3, positive: false },
      { rank: 3, player: "Kai", value: "-£34.50", winRate: "50%", sessions: 4, positive: false },
      { rank: 4, player: "Toby", value: "-£2.50", winRate: "75%", sessions: 4, positive: false },
      { rank: 5, player: "Jake", value: "+£0.15", winRate: "100%", sessions: 2, positive: true },
      { rank: 6, player: "Liam", value: "+£2.00", winRate: "100%", sessions: 1, positive: true },
      { rank: 7, player: "Connor", value: "+£13.50", winRate: "100%", sessions: 2, positive: true },
      { rank: 8, player: "Tony", value: "+£42.50", winRate: "100%", sessions: 1, positive: true },
    ],
  },
  "the-vacuum": {
    slug: "the-vacuum",
    title: "Food Gremlin",
    subtitle: "Eats more than they play.",
    metricLabel: "Food Spend",
    rows: [
      { rank: 1, player: "Jake", value: "£48.95", winRate: "100%", sessions: 2, positive: true },
      { rank: 2, player: "Kai", value: "£40.66", winRate: "50%", sessions: 4, positive: true },
      { rank: 3, player: "Toby", value: "£36.70", winRate: "75%", sessions: 4, positive: true },
      { rank: 4, player: "Tristan", value: "£19.87", winRate: "50%", sessions: 4, positive: true },
      { rank: 5, player: "Harry", value: "£16.62", winRate: "33%", sessions: 3, positive: true },
      { rank: 6, player: "Tony", value: "£11.80", winRate: "100%", sessions: 1, positive: true },
      { rank: 7, player: "Connor", value: "£0.00", winRate: "100%", sessions: 2, positive: true },
      { rank: 8, player: "Liam", value: "£0.00", winRate: "100%", sessions: 1, positive: true },
    ],
  },
  "the-grinder": {
    slug: "the-grinder",
    title: "Part of the Furniture",
    subtitle: "Never misses a session — practically lives at the table.",
    metricLabel: "Sessions",
    rows: [
      { rank: 1, player: "Kai", value: "4", winRate: "50%", sessions: 4, positive: true },
      { rank: 2, player: "Toby", value: "4", winRate: "75%", sessions: 4, positive: true },
      { rank: 3, player: "Tristan", value: "4", winRate: "50%", sessions: 4, positive: true },
      { rank: 4, player: "Harry", value: "3", winRate: "33%", sessions: 3, positive: true },
      { rank: 5, player: "Connor", value: "2", winRate: "100%", sessions: 2, positive: true },
      { rank: 6, player: "Jake", value: "2", winRate: "100%", sessions: 2, positive: true },
      { rank: 7, player: "Liam", value: "1", winRate: "100%", sessions: 1, positive: true },
      { rank: 8, player: "Tony", value: "1", winRate: "100%", sessions: 1, positive: true },
    ],
  },
  "the-maniac": {
    slug: "the-maniac",
    title: "Cardiac Episode",
    subtitle: "Wild swings between best and worst nights.",
    metricLabel: "Max Swing",
    rows: [
      { rank: 1, player: "Tristan", value: "£99.40", winRate: "50%", sessions: 4, positive: true },
      { rank: 2, player: "Jake", value: "£56.35", winRate: "100%", sessions: 2, positive: true },
      { rank: 3, player: "Harry", value: "£48.65", winRate: "33%", sessions: 3, positive: true },
      { rank: 4, player: "Tony", value: "£42.50", winRate: "100%", sessions: 1, positive: true },
      { rank: 5, player: "Kai", value: "£38.00", winRate: "50%", sessions: 4, positive: true },
      { rank: 6, player: "Toby", value: "£18.80", winRate: "75%", sessions: 4, positive: true },
      { rank: 7, player: "Liam", value: "£2.00", winRate: "100%", sessions: 1, positive: true },
      { rank: 8, player: "Connor", value: "£0.80", winRate: "100%", sessions: 2, positive: true },
    ],
  },
};

leaderboardCategories["overall-winners"] = {
  slug: "overall-winners",
  title: "Overall Winners",
  subtitle: "Lifetime net profit at a glance.",
  metricLabel: "Profit",
  rows: [],
};

export const leaderboardCategoryOrder: string[] = [
  "overall-winners",
  "overall-leader",
  "the-shark",
  "the-whale",
  "the-tank",
  "the-vacuum",
  "the-grinder",
  "the-maniac",
];

export function computeLeaderboardCategories(games: HistoricalGame[] = []): Record<string, LeaderboardCategory> {
  const safeGames = games ?? [];
  const byPlayer = new Map<string, { date: string; net: number; buyIn: number; food: number }[]>();
  // Reverse games so we walk oldest first (chronological order)
  const chronoGames = [...safeGames].reverse();
  chronoGames.forEach((g) => {
    if (!g || !g.players) return;
    g.players.forEach((p) => {
      if (!p || !p.name) return;
      const net = (p.cashOut ?? 0) - (p.buyIn ?? 0);
      const lower = p.name.toLowerCase();
      if (!byPlayer.has(lower)) byPlayer.set(lower, []);
      byPlayer.get(lower)!.push({ date: g.date, net, buyIn: p.buyIn ?? 0, food: p.food ?? 0 });
    });
  });

  const playerStats = [...byPlayer.entries()].map(([lower, sessions]) => {
    // Find the latest casing of the name from the games list
    let displayName = lower;
    for (const g of safeGames) {
      if (!g || !g.players) continue;
      const p = g.players.find(pl => pl && pl.name && pl.name.toLowerCase() === lower);
      if (p) {
        displayName = p.name;
        break;
      }
    }

    const netLifetime = sessions.reduce((sum, s) => sum + s.net, 0);
    const totalBuyIn = sessions.reduce((sum, s) => sum + s.buyIn, 0);
    const totalFood = sessions.reduce((sum, s) => sum + s.food, 0);
    const winSessions = sessions.filter(s => s.net >= 0).length;
    const winRate = sessions.length > 0 ? (winSessions / sessions.length) * 100 : 0;

    const worstEntry = sessions.reduce((worst, s) => s.net < worst.net ? s : worst, sessions[0]) ?? { net: 0, date: "" };
    const bestEntry = sessions.reduce((best, s) => s.net > best.net ? s : best, sessions[0]) ?? { net: 0, date: "" };
    const swing = bestEntry.net - worstEntry.net;
    const lastSessionNet = sessions[sessions.length - 1]?.net ?? 0;

    return {
      name: displayName,
      netLifetime,
      totalBuyIn,
      totalFood,
      sessions: sessions.length,
      winRate,
      worstSingleNet: worstEntry.net,
      worstSingleDate: worstEntry.date,
      bestSingleNet: bestEntry.net,
      swing,
      lastSessionNet,
    };
  });

  // 1. Money Printer (overall-leader)
  const overallLeaderRows = [...playerStats]
    .sort((a, b) => b.netLifetime - a.netLifetime)
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: formatCurrency(p.netLifetime, true),
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
      trendDirection: (p.lastSessionNet > 0.005 ? "up" : (p.lastSessionNet < -0.005 ? "down" : "flat")) as "up" | "down" | "flat",
    }));

  // 2. Probably Cheating (the-shark)
  const sharkRows = [...playerStats]
    .sort((a, b) => {
      const diff = b.winRate - a.winRate;
      if (Math.abs(diff) > 0.001) return diff;
      return b.netLifetime - a.netLifetime;
    })
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: `${Math.round(p.winRate)}%`,
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
    }));

  // 3. Mortgage Material (the-whale)
  const whaleRows = [...playerStats]
    .sort((a, b) => b.totalBuyIn - a.totalBuyIn)
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: formatCurrency(p.totalBuyIn),
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
    }));

  // 4. The Pit (the-tank)
  const tankRows = [...playerStats]
    .sort((a, b) => a.worstSingleNet - b.worstSingleNet) // lowest net session first
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: formatCurrency(p.worstSingleNet, true),
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
    }));

  // 5. Food Gremlin (the-vacuum)
  const vacuumRows = [...playerStats]
    .sort((a, b) => b.totalFood - a.totalFood)
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: formatCurrency(p.totalFood),
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
    }));

  // 6. Part of the Furniture (the-grinder)
  const grinderRows = [...playerStats]
    .sort((a, b) => b.sessions - a.sessions)
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: String(p.sessions),
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
    }));

  // 7. Cardiac Episode (the-maniac)
  const maniacRows = [...playerStats]
    .sort((a, b) => b.swing - a.swing)
    .map((p, idx) => ({
      rank: idx + 1,
      player: p.name,
      value: formatCurrency(p.swing),
      winRate: `${Math.round(p.winRate)}%`,
      sessions: p.sessions,
      positive: p.netLifetime >= 0,
    }));

  return {
    "overall-winners": {
      slug: "overall-winners",
      title: "Overall Winners",
      subtitle: "Lifetime net profit at a glance.",
      metricLabel: "Profit",
      rows: [],
    },
    "overall-leader": {
      slug: "overall-leader",
      title: "Money Printer",
      subtitle: "The biggest all-time winner.",
      metricLabel: "Profit",
      rows: overallLeaderRows,
    },
    "the-shark": {
      slug: "the-shark",
      title: "Probably Cheating",
      subtitle: "Wins so consistently it raises eyebrows.",
      metricLabel: "Win Rate",
      rows: sharkRows,
    },
    "the-whale": {
      slug: "the-whale",
      title: "Mortgage Material",
      subtitle: "Has pushed the most chips across the table.",
      metricLabel: "Total Invested",
      rows: whaleRows,
    },
    "the-tank": {
      slug: "the-tank",
      title: "The Pit",
      subtitle: "Took the worst beating in a single night.",
      metricLabel: "Worst Loss",
      rows: tankRows,
    },
    "the-vacuum": {
      slug: "the-vacuum",
      title: "Food Gremlin",
      subtitle: "Eats more than they play.",
      metricLabel: "Food Spend",
      rows: vacuumRows,
    },
    "the-grinder": {
      slug: "the-grinder",
      title: "Part of the Furniture",
      subtitle: "Never misses a session — practically lives at the table.",
      metricLabel: "Sessions",
      rows: grinderRows,
    },
    "the-maniac": {
      slug: "the-maniac",
      title: "Cardiac Episode",
      subtitle: "Wild swings between best and worst nights.",
      metricLabel: "Max Swing",
      rows: maniacRows,
    },
  };
}

