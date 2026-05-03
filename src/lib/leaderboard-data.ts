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

export const leaderboardCategories: Record<string, LeaderboardCategory> = {
  "overall-leader": {
    slug: "overall-leader",
    title: "King of the Felt",
    subtitle: "Most money won, all-time. Sum of every session's net profit (cash-out minus buy-ins minus food).",
    metricLabel: "Net Profit",
    rows: [
      { rank: 1, player: "Player G", value: "+£2,500", winRate: "68%", sessions: 14, positive: true, trendDirection: "flat" },
      { rank: 2, player: "Player A", value: "+£1,200", winRate: "55%", sessions: 22, positive: true, trendDirection: "up" },
      { rank: 3, player: "Player B", value: "+£800", winRate: "75%", sessions: 8, positive: true, trendDirection: "down" },
      { rank: 4, player: "Player E", value: "+£150", winRate: "52%", sessions: 42, positive: true, trendDirection: "up" },
      { rank: 5, player: "Player H", value: "+£50", winRate: "48%", sessions: 12, positive: true, trendDirection: "flat" },
      { rank: 6, player: "Player F", value: "-£100", winRate: "45%", sessions: 18, positive: false, trendDirection: "down" },
      { rank: 7, player: "Player C", value: "-£300", winRate: "40%", sessions: 6, positive: false, trendDirection: "up" },
      { rank: 8, player: "Player D", value: "-£500", winRate: "35%", sessions: 10, positive: false, trendDirection: "flat" },
    ],
  },
  "the-shark": {
    slug: "the-shark",
    title: "Apex Predator",
    subtitle: "Highest cash-out rate. Sessions ended in the green divided by total sessions played — minimum 5 sessions to qualify.",
    metricLabel: "Win Rate",
    rows: [
      { rank: 1, player: "Player B", value: "75%", winRate: "75%", sessions: 8, positive: true },
      { rank: 2, player: "Player G", value: "68%", winRate: "68%", sessions: 14, positive: true },
      { rank: 3, player: "Player A", value: "55%", winRate: "55%", sessions: 22, positive: true },
      { rank: 4, player: "Player E", value: "52%", winRate: "52%", sessions: 42, positive: true },
      { rank: 5, player: "Player H", value: "48%", winRate: "48%", sessions: 12, positive: true },
      { rank: 6, player: "Player F", value: "45%", winRate: "45%", sessions: 18, positive: false },
      { rank: 7, player: "Player C", value: "40%", winRate: "40%", sessions: 6, positive: false },
      { rank: 8, player: "Player D", value: "35%", winRate: "35%", sessions: 10, positive: false },
    ],
  },
  "the-whale": {
    slug: "the-whale",
    title: "Deep Pockets",
    subtitle: "Total chips on the table. Sum of every buy-in and rebuy — proof of who keeps reaching for the wallet.",
    metricLabel: "Total Invested",
    rows: [
      { rank: 1, player: "Player C", value: "£5,000", winRate: "40%", sessions: 6, positive: true },
      { rank: 2, player: "Player E", value: "£4,200", winRate: "52%", sessions: 42, positive: true },
      { rank: 3, player: "Player A", value: "£3,800", winRate: "55%", sessions: 22, positive: true },
      { rank: 4, player: "Player F", value: "£3,000", winRate: "45%", sessions: 18, positive: true },
      { rank: 5, player: "Player G", value: "£2,700", winRate: "68%", sessions: 14, positive: true },
      { rank: 6, player: "Player D", value: "£2,200", winRate: "35%", sessions: 10, positive: true },
      { rank: 7, player: "Player B", value: "£1,400", winRate: "75%", sessions: 8, positive: true },
      { rank: 8, player: "Player H", value: "£900", winRate: "48%", sessions: 12, positive: true },
    ],
  },
  "the-tank": {
    slug: "the-tank",
    title: "Bag of Bricks",
    subtitle: "Worst single-session bath. The largest negative net (cash-out minus buy-ins minus food) any one player has logged in a single night.",
    metricLabel: "Worst Loss",
    rows: [
      { rank: 1, player: "Player D", value: "-£800", winRate: "35%", sessions: 10, positive: false },
      { rank: 2, player: "Player C", value: "-£620", winRate: "40%", sessions: 6, positive: false },
      { rank: 3, player: "Player F", value: "-£480", winRate: "45%", sessions: 18, positive: false },
      { rank: 4, player: "Player E", value: "-£340", winRate: "52%", sessions: 42, positive: false },
      { rank: 5, player: "Player A", value: "-£280", winRate: "55%", sessions: 22, positive: false },
      { rank: 6, player: "Player H", value: "-£190", winRate: "48%", sessions: 12, positive: false },
      { rank: 7, player: "Player G", value: "-£150", winRate: "68%", sessions: 14, positive: false },
      { rank: 8, player: "Player B", value: "-£90", winRate: "75%", sessions: 8, positive: false },
    ],
  },
  "the-vacuum": {
    slug: "the-vacuum",
    title: "Pizza Hoover",
    subtitle: "Total spent on snacks and takeaways across every session — chips and chips, basically. Logged in the food column on game night.",
    metricLabel: "Food Spend",
    rows: [
      { rank: 1, player: "Player E", value: "£350", winRate: "52%", sessions: 42, positive: true },
      { rank: 2, player: "Player A", value: "£280", winRate: "55%", sessions: 22, positive: true },
      { rank: 3, player: "Player F", value: "£240", winRate: "45%", sessions: 18, positive: true },
      { rank: 4, player: "Player G", value: "£190", winRate: "68%", sessions: 14, positive: true },
      { rank: 5, player: "Player C", value: "£140", winRate: "40%", sessions: 6, positive: true },
      { rank: 6, player: "Player H", value: "£90", winRate: "48%", sessions: 12, positive: true },
      { rank: 7, player: "Player D", value: "£75", winRate: "35%", sessions: 10, positive: true },
      { rank: 8, player: "Player B", value: "£20", winRate: "75%", sessions: 8, positive: true },
    ],
  },
  "the-grinder": {
    slug: "the-grinder",
    title: "Iron Bladder",
    subtitle: "Most sessions played, full stop. Show up, sit down, stay 'til the end — every game on the books counts toward this one.",
    metricLabel: "Sessions",
    rows: [
      { rank: 1, player: "Player F", value: "42", winRate: "45%", sessions: 42, positive: true },
      { rank: 2, player: "Player A", value: "22", winRate: "55%", sessions: 22, positive: true },
      { rank: 3, player: "Player E", value: "20", winRate: "52%", sessions: 20, positive: true },
      { rank: 4, player: "Player G", value: "14", winRate: "68%", sessions: 14, positive: true },
      { rank: 5, player: "Player H", value: "12", winRate: "48%", sessions: 12, positive: true },
      { rank: 6, player: "Player D", value: "10", winRate: "35%", sessions: 10, positive: true },
      { rank: 7, player: "Player B", value: "8", winRate: "75%", sessions: 8, positive: true },
    ],
  },
  "the-maniac": {
    slug: "the-maniac",
    title: "Roller Coaster",
    subtitle: "Biggest single-session swing. The gap between a player's highest stack and lowest stack within one game — pure chaos rewarded.",
    metricLabel: "Max Swing",
    rows: [
      { rank: 1, player: "Player G", value: "£1,500", winRate: "68%", sessions: 14, positive: true },
      { rank: 2, player: "Player C", value: "£1,200", winRate: "40%", sessions: 6, positive: true },
      { rank: 3, player: "Player D", value: "£1,050", winRate: "35%", sessions: 10, positive: true },
      { rank: 4, player: "Player A", value: "£900", winRate: "55%", sessions: 22, positive: true },
      { rank: 5, player: "Player F", value: "£820", winRate: "45%", sessions: 18, positive: true },
      { rank: 6, player: "Player E", value: "£640", winRate: "52%", sessions: 42, positive: true },
      { rank: 7, player: "Player B", value: "£500", winRate: "75%", sessions: 8, positive: true },
      { rank: 8, player: "Player H", value: "£300", winRate: "48%", sessions: 12, positive: true },
    ],
  },
  "the-rock": {
    slug: "the-rock",
    title: "Stone Wall",
    subtitle: "Tightest player at the table. Lowest VPIP — the percentage of hands voluntarily entered. Lower is more disciplined.",
    metricLabel: "VPIP",
    rows: [
      { rank: 1, player: "Player H", value: "12%", winRate: "48%", sessions: 12, positive: true },
      { rank: 2, player: "Player B", value: "16%", winRate: "75%", sessions: 8, positive: true },
      { rank: 3, player: "Player G", value: "22%", winRate: "68%", sessions: 14, positive: true },
      { rank: 4, player: "Player A", value: "26%", winRate: "55%", sessions: 22, positive: true },
      { rank: 5, player: "Player E", value: "30%", winRate: "52%", sessions: 42, positive: true },
      { rank: 6, player: "Player C", value: "38%", winRate: "40%", sessions: 6, positive: false },
      { rank: 7, player: "Player F", value: "44%", winRate: "45%", sessions: 18, positive: false },
      { rank: 8, player: "Player D", value: "52%", winRate: "35%", sessions: 10, positive: false },
    ],
  },
  "the-earner": {
    slug: "the-earner",
    title: "Clock Puncher",
    subtitle: "Best £-per-hour rate. Lifetime net profit divided by total time played across every session — patience pays.",
    metricLabel: "Hourly Rate",
    rows: [
      { rank: 1, player: "Player B", value: "£45/h", winRate: "75%", sessions: 8, positive: true, trendDirection: "up" },
      { rank: 2, player: "Player G", value: "£38/h", winRate: "68%", sessions: 14, positive: true, trendDirection: "flat" },
      { rank: 3, player: "Player A", value: "£22/h", winRate: "55%", sessions: 22, positive: true, trendDirection: "down" },
      { rank: 4, player: "Player E", value: "£8/h", winRate: "52%", sessions: 42, positive: true, trendDirection: "up" },
      { rank: 5, player: "Player H", value: "£2/h", winRate: "48%", sessions: 12, positive: true, trendDirection: "flat" },
      { rank: 6, player: "Player F", value: "-£4/h", winRate: "45%", sessions: 18, positive: false, trendDirection: "down" },
      { rank: 7, player: "Player C", value: "-£18/h", winRate: "40%", sessions: 6, positive: false, trendDirection: "down" },
      { rank: 8, player: "Player D", value: "-£25/h", winRate: "35%", sessions: 10, positive: false, trendDirection: "flat" },
    ],
  },
};

export const leaderboardCategoryOrder: string[] = [
  "overall-leader",
  "the-earner",
  "the-shark",
  "the-whale",
  "the-tank",
  "the-vacuum",
  "the-grinder",
  "the-maniac",
  "the-rock",
];
