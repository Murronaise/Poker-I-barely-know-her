// Supabase-backed finalized-game persistence. Companion to the hardcoded
// `historical-games.ts` seed array — finalized live sessions land here, and
// the games index / detail pages merge both sources at read time.
//
// Reads work with either the SSR or browser client (anon key, RLS allows
// SELECT for everyone). Writes go through the browser client so the admin's
// auth cookie travels with the request — RLS rejects non-admins.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoricalGame, HistoricalPlayer } from "./historical-games";

const GAMES_TABLE = "games";
const PLAYERS_TABLE = "game_players";

type GameRow = {
  id: string;
  played_at: string;
  date_label: string;
  duration_label: string;
  blinds_label: string;
  small_blind: number | string | null;
  big_blind: number | string | null;
  location: string;
  total_pot: number | string;
};

type PlayerRow = {
  game_id: string;
  player_name: string;
  buy_in: number | string;
  cash_out: number | string;
  food: number | string;
};

// Postgres NUMERIC columns come back as strings via PostgREST to preserve
// precision. Coerce defensively so callers can do arithmetic without
// thinking about it.
const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export type SaveFinalizedGameInput = {
  id: string;
  playedAt: Date;
  durationMinutes: number;
  smallBlind: number;
  bigBlind: number;
  location: string;
  players: {
    name: string;
    buyIn: number;
    cashOut: number;
    food: number;
  }[];
};

const formatDateLabel = (d: Date): string =>
  d.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" });

const formatDurationLabel = (mins: number): string => {
  const safe = Math.max(0, Math.round(mins));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

const formatBlindsLabel = (sb: number, bb: number): string =>
  `£${sb.toFixed(2)} / £${bb.toFixed(2)}`;

/**
 * Persist a finalized live game. Writes the parent row + all player rows.
 * Caller (the live-game finalize handler) should run this BEFORE clearing
 * the sessionStorage snapshot so a failed write leaves the session
 * recoverable on refresh.
 *
 * Returns the saved record's id on success, throws on failure so the caller
 * can show a toast and keep the snapshot alive.
 */
export async function saveFinalizedGame(
  client: SupabaseClient,
  input: SaveFinalizedGameInput,
): Promise<string> {
  const totalPot = input.players.reduce((sum, p) => sum + (p.buyIn || 0), 0);
  const { data: { user } } = await client.auth.getUser();

  const gamePayload = {
    id: input.id,
    played_at: input.playedAt.toISOString(),
    date_label: formatDateLabel(input.playedAt),
    duration_label: formatDurationLabel(input.durationMinutes),
    blinds_label: formatBlindsLabel(input.smallBlind, input.bigBlind),
    small_blind: input.smallBlind,
    big_blind: input.bigBlind,
    location: input.location,
    total_pot: totalPot,
    created_by: user?.id ?? null,
  };

  // Upsert the parent row so a re-finalize after a typo correction
  // overwrites cleanly instead of failing on the PK.
  const { error: gameErr } = await client
    .from(GAMES_TABLE)
    .upsert(gamePayload, { onConflict: "id" });
  if (gameErr) throw gameErr;

  // Replace player rows wholesale — simpler than diffing and matches the
  // semantics of "re-finalizing": whatever's on screen now is the truth.
  const { error: delErr } = await client
    .from(PLAYERS_TABLE)
    .delete()
    .eq("game_id", input.id);
  if (delErr) throw delErr;

  if (input.players.length > 0) {
    const playerPayload = input.players.map((p) => ({
      game_id: input.id,
      player_name: p.name,
      buy_in: p.buyIn,
      cash_out: p.cashOut,
      food: p.food,
    }));
    const { error: insErr } = await client
      .from(PLAYERS_TABLE)
      .insert(playerPayload);
    if (insErr) throw insErr;
  }

  return input.id;
}

const rowToHistoricalPlayer = (r: PlayerRow): HistoricalPlayer => ({
  name: r.player_name,
  buyIn: num(r.buy_in),
  cashOut: num(r.cash_out),
  food: num(r.food),
});

const rowsToHistoricalGame = (
  game: GameRow,
  players: PlayerRow[],
): HistoricalGame => ({
  id: game.id,
  date: game.date_label,
  duration: game.duration_label,
  blinds: game.blinds_label,
  totalPot: num(game.total_pot),
  location: game.location,
  players: players.map(rowToHistoricalPlayer),
});

/**
 * Fetch every saved game in the same shape the hardcoded historical array
 * uses, so the games index can `[...seed, ...saved]` without translating.
 * Sorted most-recent first to match the seed order.
 *
 * Failures (missing table, network) resolve to an empty array — the seed
 * array still renders so the page is never blank.
 */
export async function fetchSavedGames(
  client: SupabaseClient,
): Promise<HistoricalGame[]> {
  try {
    const { data: gameRows, error: gameErr } = await client
      .from(GAMES_TABLE)
      .select("id, played_at, date_label, duration_label, blinds_label, small_blind, big_blind, location, total_pot")
      .order("played_at", { ascending: false });
    if (gameErr || !gameRows || gameRows.length === 0) return [];

    const ids = gameRows.map((g: GameRow) => g.id);
    const { data: playerRows, error: playerErr } = await client
      .from(PLAYERS_TABLE)
      .select("game_id, player_name, buy_in, cash_out, food")
      .in("game_id", ids);
    if (playerErr) return [];

    const byGame = new Map<string, PlayerRow[]>();
    (playerRows ?? []).forEach((r: PlayerRow) => {
      const list = byGame.get(r.game_id) ?? [];
      list.push(r);
      byGame.set(r.game_id, list);
    });

    return (gameRows as GameRow[]).map((g) =>
      rowsToHistoricalGame(g, byGame.get(g.id) ?? []),
    );
  } catch {
    return [];
  }
}

/** Single-game lookup used by the history detail page. */
export async function fetchSavedGame(
  client: SupabaseClient,
  id: string,
): Promise<HistoricalGame | null> {
  try {
    const { data: game, error: gameErr } = await client
      .from(GAMES_TABLE)
      .select("id, played_at, date_label, duration_label, blinds_label, small_blind, big_blind, location, total_pot")
      .eq("id", id)
      .maybeSingle();
    if (gameErr || !game) return null;

    const { data: playerRows } = await client
      .from(PLAYERS_TABLE)
      .select("game_id, player_name, buy_in, cash_out, food")
      .eq("game_id", id);

    return rowsToHistoricalGame(game as GameRow, (playerRows ?? []) as PlayerRow[]);
  } catch {
    return null;
  }
}

function parseBlinds(blindsStr: string): { sb: number; bb: number } {
  const clean = blindsStr.replace(/£/g, "");
  const parts = clean.split("/").map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { sb: parts[0], bb: parts[1] };
  }
  const matches = clean.match(/\d+(\.\d+)?/g);
  if (matches && matches.length >= 2) {
    return { sb: parseFloat(matches[0]), bb: parseFloat(matches[1]) };
  }
  return { sb: 0, bb: 0 };
}

function parseDate(dateStr: string, fallbackIso?: string): string {
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return fallbackIso || new Date().toISOString();
}

/**
 * Edit a game's metadata and its player list. Overwrites/upserts the game row in
 * Supabase and replaces player rows. Enforces zero-sum rules at the db layer if needed.
 */
export async function updateGameAndPlayers(
  client: SupabaseClient,
  gameId: string,
  input: {
    date: string;
    duration: string;
    blinds: string;
    location: string;
    players: {
      name: string;
      buyIn: number;
      cashOut: number;
      food: number;
    }[];
  }
): Promise<void> {
  const totalPot = input.players.reduce((sum, p) => sum + (p.buyIn || 0), 0);
  const { sb, bb } = parseBlinds(input.blinds);
  
  // Get existing game to check fallback played_at
  const { data: existingGame } = await client
    .from(GAMES_TABLE)
    .select("played_at")
    .eq("id", gameId)
    .maybeSingle();
    
  const playedAtIso = parseDate(input.date, existingGame?.played_at);
  const { data: { user } } = await client.auth.getUser();

  const gamePayload = {
    id: gameId,
    played_at: playedAtIso,
    date_label: input.date.trim(),
    duration_label: input.duration.trim(),
    blinds_label: input.blinds.trim(),
    small_blind: sb,
    big_blind: bb,
    location: input.location.trim(),
    total_pot: totalPot,
    created_by: user?.id ?? null,
  };

  const { error: gameErr } = await client
    .from(GAMES_TABLE)
    .upsert(gamePayload, { onConflict: "id" });
  if (gameErr) throw gameErr;

  const { error: delErr } = await client
    .from(PLAYERS_TABLE)
    .delete()
    .eq("game_id", gameId);
  if (delErr) throw delErr;

  if (input.players.length > 0) {
    const playerPayload = input.players.map((p) => ({
      game_id: gameId,
      player_name: p.name,
      buy_in: p.buyIn,
      cash_out: p.cashOut,
      food: p.food,
    }));
    const { error: insErr } = await client
      .from(PLAYERS_TABLE)
      .insert(playerPayload);
    if (insErr) throw insErr;
  }
}

