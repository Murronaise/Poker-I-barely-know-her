export type HistoricalPlayer = {
  name: string;
  buyIn: number;
  cashOut: number;
  food: number;
};

export type HistoricalGame = {
  id: string;
  date: string;
  duration: string;
  blinds: string;
  totalPot: number;
  location: string;
  players: HistoricalPlayer[];
};

export const historicalGames: HistoricalGame[] = [
  {
    id: "1",
    date: "Oct 24, 2026",
    duration: "4h 15m",
    blinds: "£0.25 / £0.50",
    totalPot: 1250,
    location: "Toby's House",
    players: [
      { name: "Player G", buyIn: 200, cashOut: 950, food: 25 },
      { name: "Player A", buyIn: 200, cashOut: 250, food: 18 },
      { name: "Player B", buyIn: 150, cashOut: 50, food: 12 },
      { name: "Player C", buyIn: 250, cashOut: 0, food: 30 },
      { name: "Player D", buyIn: 250, cashOut: 0, food: 20 },
      { name: "Player E", buyIn: 200, cashOut: 0, food: 35 },
    ],
  },
  {
    id: "2",
    date: "Oct 17, 2026",
    duration: "6h 30m",
    blinds: "£0.50 / £1.00",
    totalPot: 2400,
    location: "Toby's House",
    players: [
      { name: "Player A", buyIn: 300, cashOut: 600, food: 22 },
      { name: "Player B", buyIn: 300, cashOut: 800, food: 14 },
      { name: "Player E", buyIn: 300, cashOut: 100, food: 30 },
      { name: "Player F", buyIn: 300, cashOut: 200, food: 15 },
      { name: "Player G", buyIn: 300, cashOut: 700, food: 18 },
      { name: "Player H", buyIn: 300, cashOut: 0, food: 10 },
      { name: "Player C", buyIn: 300, cashOut: 0, food: 12 },
      { name: "Player D", buyIn: 300, cashOut: 0, food: 20 },
    ],
  },
  {
    id: "3",
    date: "Oct 10, 2026",
    duration: "3h 45m",
    blinds: "£0.10 / £0.20",
    totalPot: 800,
    location: "Toby's House",
    players: [
      { name: "Player B", buyIn: 200, cashOut: 480, food: 8 },
      { name: "Player E", buyIn: 200, cashOut: 220, food: 18 },
      { name: "Player F", buyIn: 200, cashOut: 100, food: 12 },
      { name: "Player H", buyIn: 100, cashOut: 0, food: 4 },
      { name: "Player C", buyIn: 100, cashOut: 0, food: 6 },
    ],
  },
];

export const getHistoricalGame = (id: string): HistoricalGame | undefined =>
  historicalGames.find((g) => g.id === id);
