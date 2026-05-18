// Resolves "is this historical player name claimed by a real account?" — used
// for verified badges, "(you)" markers, and the account-page profile link.
//
// We compare lower-cased player_name strings, so "Toby" and "toby" both match.
// For server components, pass a Supabase server client; for client components,
// pass the browser client. Either way you get a Map<lowerName, registeredName>.

import type { SupabaseClient } from "@supabase/supabase-js";

export type RegisteredPlayerMap = Map<string, string>;

// Cap the user fetch so a future big roster doesn't drag every page that
// needs the verified-badge map. Anything past this won't get a badge until
// we move the lookup behind a server cache — call it out loudly if it
// happens.
const REGISTERED_PLAYERS_LIMIT = 500;

export async function loadRegisteredPlayers(
  sb: SupabaseClient,
): Promise<RegisteredPlayerMap> {
  const out = new Map<string, string>();
  try {
    const { data, error } = await sb
      .from("users")
      .select("player_name")
      .order("created_at", { ascending: false })
      .limit(REGISTERED_PLAYERS_LIMIT);
    if (error) return out;
    (data ?? []).forEach((row: { player_name: string | null }) => {
      if (row.player_name) {
        out.set(row.player_name.toLowerCase(), row.player_name);
      }
    });
    if ((data?.length ?? 0) === REGISTERED_PLAYERS_LIMIT) {
      console.warn(
        `[registered-players] Hit the ${REGISTERED_PLAYERS_LIMIT}-row cap — older accounts won't show the verified badge. Consider moving this lookup to a server cache.`,
      );
    }
  } catch {
    // Table may not exist yet on a fresh deploy — empty map = nothing
    // verified, which fails safe.
  }
  return out;
}

export function isRegistered(
  map: RegisteredPlayerMap,
  playerName: string,
): boolean {
  return map.has(playerName.toLowerCase());
}

/** Slug used for /profile/<slug> URLs. Mirrors what NavBar/profile use. */
export function profileSlug(playerName: string): string {
  return encodeURIComponent(playerName.toLowerCase().replace(/ /g, "-"));
}
