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

// Real session history. Order = most recent first.
// Durations and blind levels are estimates — those weren't logged at the time.
export const historicalGames: HistoricalGame[] = [
  {
    id: "2026-05-01",
    date: "May 1, 2026",
    duration: "4h 00m",
    blinds: "£0.25 / £0.50",
    totalPot: 250,
    location: "Toby's House",
    players: [
      { name: "Connor", buyIn: 25, cashOut: 38.5, food: 0 },
      { name: "Harry", buyIn: 50, cashOut: 7.7, food: 13.55 },
      { name: "Jake", buyIn: 25, cashOut: 81.5, food: 11.8 },
      { name: "Kai", buyIn: 25, cashOut: 20.5, food: 11.8 },
      { name: "Tony", buyIn: 25, cashOut: 67.5, food: 11.8 },
      { name: "Tristan", buyIn: 75, cashOut: 0, food: 11.8 },
      { name: "Toby", buyIn: 25, cashOut: 34.3, food: 11.8 },
    ],
  },
  {
    id: "2026-03-27",
    date: "Mar 27, 2026",
    duration: "2h 30m",
    blinds: "£0.10 / £0.20",
    totalPot: 160,
    location: "Toby's House",
    players: [
      { name: "Connor", buyIn: 20, cashOut: 34.3, food: 0 },
      { name: "Harry", buyIn: 40, cashOut: 23.5, food: 0 },
      { name: "Kai", buyIn: 20, cashOut: 23.2, food: 0 },
      { name: "Tristan", buyIn: 40, cashOut: 41.5, food: 0 },
      { name: "Toby", buyIn: 40, cashOut: 37.5, food: 0 },
    ],
  },
  {
    id: "2026-03-01",
    date: "Mar 1, 2026",
    duration: "2h 00m",
    blinds: "£0.10 / £0.20",
    totalPot: 100,
    location: "Toby's House",
    players: [
      { name: "Liam", buyIn: 20, cashOut: 22, food: 0 },
      { name: "Kai", buyIn: 40, cashOut: 5.5, food: 0 },
      { name: "Tristan", buyIn: 20, cashOut: 44.4, food: 0 },
      { name: "Toby", buyIn: 20, cashOut: 28.1, food: 0 },
    ],
  },
  {
    id: "2020-12-31",
    date: "Dec 31, 2020",
    duration: "2h 30m",
    blinds: "£0.10 / £0.20",
    totalPot: 105,
    location: "Toby's House",
    players: [
      { name: "Harry", buyIn: 15, cashOut: 21.35, food: 3.07 },
      { name: "Jake", buyIn: 25, cashOut: 25.15, food: 37.15 },
      { name: "Kai", buyIn: 15, cashOut: 18.5, food: 28.86 },
      { name: "Tristan", buyIn: 35, cashOut: 8.7, food: 8.07 },
      { name: "Toby", buyIn: 15, cashOut: 31.3, food: 24.9 },
    ],
  },
];

export const getHistoricalGame = (id: string): HistoricalGame | undefined =>
  historicalGames.find((g) => g.id === id);
