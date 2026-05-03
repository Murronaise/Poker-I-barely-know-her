// Client-side persistence layer for player data and avatar positioning.
// Used as a graceful fallback when Supabase isn't configured.

export type StoredPlayer = {
  name: string;
  avatarUrl?: string | null;
  createdAt: number;
};

export type AvatarPosition = {
  x: number; // % horizontal
  y: number; // % vertical
  scale: number; // 1 = no zoom
};

const PLAYERS_KEY = "pt:players";
const AVATAR_POS_KEY = "pt:avatarPos";
const VENUE_KEY = "pt:venue";

export const DEFAULT_VENUE = "Toby's House";
export const defaultAvatarPosition: AvatarPosition = { x: 50, y: 50, scale: 1 };

const readJSON = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJSON = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode failures
  }
};

export function getStoredPlayers(): StoredPlayer[] {
  return readJSON<StoredPlayer[]>(PLAYERS_KEY, []);
}

export function addStoredPlayer(p: StoredPlayer) {
  const all = getStoredPlayers();
  if (all.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) return;
  all.push(p);
  writeJSON(PLAYERS_KEY, all);
}

export function getAvatarPositionMap(): Record<string, AvatarPosition> {
  return readJSON<Record<string, AvatarPosition>>(AVATAR_POS_KEY, {});
}

export function getAvatarPosition(name: string): AvatarPosition {
  const map = getAvatarPositionMap();
  return map[name.toLowerCase()] ?? defaultAvatarPosition;
}

export function setAvatarPosition(name: string, pos: AvatarPosition) {
  const map = getAvatarPositionMap();
  map[name.toLowerCase()] = pos;
  writeJSON(AVATAR_POS_KEY, map);
}

// Default game venue — every game's hosted at Toby's House unless the user
// changes it on the create-game screen. Stored as plain string, not JSON.
export function getVenue(): string {
  if (typeof window === "undefined") return DEFAULT_VENUE;
  try {
    return window.localStorage.getItem(VENUE_KEY) || DEFAULT_VENUE;
  } catch {
    return DEFAULT_VENUE;
  }
}

export function setVenue(venue: string) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = venue.trim() || DEFAULT_VENUE;
    window.localStorage.setItem(VENUE_KEY, trimmed);
  } catch {
    // ignore
  }
}
