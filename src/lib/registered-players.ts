// Resolves "is this historical player name claimed by a real account?" — used
// for verified badges, "(you)" markers, and the account-page profile link.
//
// We compare lower-cased player_name strings, so "Toby" and "toby" both match.
// For server components, pass a Supabase server client; for client components,
// pass the browser client. Either way you get a Map<lowerName, registeredName>.

import type { SupabaseClient } from "@supabase/supabase-js";

export type RegisteredPlayerMap = Map<string, string>;

export async function loadRegisteredPlayers(
  sb: SupabaseClient,
): Promise<RegisteredPlayerMap> {
  const out = new Map<string, string>();
  try {
    const { data } = await sb.from("users").select("player_name");
    (data ?? []).forEach((row: { player_name: string | null }) => {
      if (row.player_name) {
        out.set(row.player_name.toLowerCase(), row.player_name);
      }
    });
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
