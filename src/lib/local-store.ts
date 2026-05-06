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
// Whoever fronts the food order on game night — every other player owes them
// their share of the food. Surfaced in the settlement breakdown so it's
// obvious where the money goes.
export const FOOD_PAYER = "Toby";
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

export function removeStoredPlayer(name: string) {
  const all = getStoredPlayers().filter(
    (p) => p.name.toLowerCase() !== name.toLowerCase(),
  );
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

// Per-player settlement tracking. The previous boolean per-game flag has
// been replaced by a per-player record so admins can tick off settlements
// one debtor at a time. A game is considered "fully settled" when every
// player who owed money has been ticked.
//
// Schema: { [gameId]: string[] }  — array of lower-cased player names that
// have paid up for that game.
const SETTLED_PLAYERS_KEY = "pt:settledPlayers";

// Legacy key kept around so games marked settled before this change still
// show as settled. Read-only — we don't write to it any more.
const LEGACY_SETTLED_GAMES_KEY = "pt:settledGames";

type SettledPlayersMap = Record<string, string[]>;

function readSettledMap(): SettledPlayersMap {
  return readJSON<SettledPlayersMap>(SETTLED_PLAYERS_KEY, {});
}

function writeSettledMap(map: SettledPlayersMap): void {
  writeJSON(SETTLED_PLAYERS_KEY, map);
}

/** Lower-cased player names that have paid up for this game. */
export function getSettledPlayersForGame(gameId: string): Set<string> {
  return new Set(readSettledMap()[gameId] ?? []);
}

export function isPlayerSettled(gameId: string, playerName: string): boolean {
  return getSettledPlayersForGame(gameId).has(playerName.toLowerCase());
}

/** Toggle a single player's settled status; returns the new boolean. */
export function togglePlayerSettled(gameId: string, playerName: string): boolean {
  const map = readSettledMap();
  const list = new Set(map[gameId] ?? []);
  const key = playerName.toLowerCase();
  let nextSettled: boolean;
  if (list.has(key)) {
    list.delete(key);
    nextSettled = false;
  } else {
    list.add(key);
    nextSettled = true;
  }
  map[gameId] = [...list];
  writeSettledMap(map);
  return nextSettled;
}

/**
 * A game is settled when every player in `requiredPayers` has been ticked
 * off. Pass the list of player names who actually owed money for the game
 * — the caller computes this from the settlement breakdown.
 *
 * Falls back to the legacy "marked settled" flag so games settled before
 * the per-player change keep their state.
 */
export function isGameSettled(gameId: string, requiredPayers?: string[]): boolean {
  // Honour the legacy whole-game flag.
  const legacy = readJSON<string[]>(LEGACY_SETTLED_GAMES_KEY, []);
  if (legacy.includes(gameId)) return true;

  if (!requiredPayers || requiredPayers.length === 0) return false;
  const settled = getSettledPlayersForGame(gameId);
  return requiredPayers.every((p) => settled.has(p.toLowerCase()));
}

/**
 * Reset every settlement record for a game — both the per-player ticks AND
 * the legacy whole-game flag. Used by the admin "Reset" button when a game
 * was accidentally marked settled and needs to be re-opened.
 */
export function clearGameSettlement(gameId: string): void {
  // Per-player map.
  const map = readSettledMap();
  if (map[gameId]) {
    delete map[gameId];
    writeSettledMap(map);
  }
  // Legacy whole-game list.
  const legacy = readJSON<string[]>(LEGACY_SETTLED_GAMES_KEY, []);
  if (legacy.includes(gameId)) {
    writeJSON(LEGACY_SETTLED_GAMES_KEY, legacy.filter((id) => id !== gameId));
  }
}

// Game delete/patch overlay for localStorage — allows editing hardcoded games
const DELETED_GAME_IDS_KEY = "pt:deletedGameIds";
const GAME_PATCHES_KEY = "pt:gamePatches";

export function getDeletedGameIds(): Set<string> {
  return new Set(readJSON<string[]>(DELETED_GAME_IDS_KEY, []));
}

export function deleteGame(id: string): void {
  const existing = readJSON<string[]>(DELETED_GAME_IDS_KEY, []);
  if (!existing.includes(id)) {
    writeJSON(DELETED_GAME_IDS_KEY, [...existing, id]);
  }
}

export function undeleteGame(id: string): void {
  const existing = readJSON<string[]>(DELETED_GAME_IDS_KEY, []);
  writeJSON(DELETED_GAME_IDS_KEY, existing.filter(gid => gid !== id));
}

export function getGamePatches(): Record<string, Record<string, unknown>> {
  return readJSON<Record<string, Record<string, unknown>>>(GAME_PATCHES_KEY, {});
}

export function getGamePatch(id: string): Record<string, unknown> | null {
  const patches = getGamePatches();
  return patches[id] ?? null;
}

export function patchGame(id: string, patch: Record<string, unknown>): void {
  const patches = getGamePatches();
  patches[id] = { ...(patches[id] ?? {}), ...patch };
  writeJSON(GAME_PATCHES_KEY, patches);
}

// Blind structure templates for quick reuse on the create game page
export type BlindTemplate = {
  name: string;
  sb: number;
  bb: number;
  timerMinutes: number;
};

const BLIND_TEMPLATES_KEY = "pt:blindTemplates";

export function getBlindTemplates(): BlindTemplate[] {
  return readJSON<BlindTemplate[]>(BLIND_TEMPLATES_KEY, []);
}

export function saveBlindTemplate(template: BlindTemplate): void {
  const existing = getBlindTemplates();
  // Avoid duplicates by name (case-insensitive)
  const deduped = existing.filter(t => t.name.toLowerCase() !== template.name.toLowerCase());
  writeJSON(BLIND_TEMPLATES_KEY, [...deduped, template]);
}

export function deleteBlindTemplate(name: string): void {
  const existing = getBlindTemplates();
  writeJSON(BLIND_TEMPLATES_KEY, existing.filter(t => t.name.toLowerCase() !== name.toLowerCase()));
}
