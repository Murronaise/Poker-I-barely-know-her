// Player-name aliases — admin-curated mapping from a lowercase variant to
// the canonical display name. Used to collapse "toby" + "Toby" + a typo
// like "tobby" into a single roster entry without mutating the historical
// session log.
//
// SELECT is public (RLS allows everyone) so every consumer can canonicalise
// names without an auth round-trip; writes are admin-only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";
import { recordAudit } from "./audit-log";

const TABLE = "player_aliases";

export type AliasMap = Map<string, string>; // lower → canonical

export async function fetchAliasMap(client: SupabaseClient): Promise<AliasMap> {
  const out: AliasMap = new Map();
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("alias_lower, canonical_name");
    if (error || !data) return out;
    data.forEach((r: { alias_lower: string; canonical_name: string }) => {
      out.set(r.alias_lower, r.canonical_name);
    });
  } catch {
    // Migration not applied — empty map means "no aliases", which is the
    // safe failure mode (the system behaves as it did pre-aliases).
  }
  return out;
}

/**
 * Resolve a name to its canonical form via the alias map. Falls back to
 * the input when there's no alias entry — so canonicalising a clean name
 * is a no-op.
 */
export function canonicalisePlayerName(
  name: string,
  aliases: AliasMap,
): string {
  return aliases.get(name.toLowerCase()) ?? name;
}

export type AliasRecord = {
  aliasLower: string;
  canonicalName: string;
  createdAt: string;
  createdByName: string | null;
};

/** Richer listing for the admin merge page. */
export async function fetchAliasRecords(
  client: SupabaseClient,
): Promise<AliasRecord[]> {
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("alias_lower, canonical_name, created_at, created_by")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    const actorIds = Array.from(
      new Set(
        data
          .map((r: { created_by: string | null }) => r.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const nameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await client
        .from("users")
        .select("user_id, player_name")
        .in("user_id", actorIds);
      (users ?? []).forEach((u: { user_id: string; player_name: string }) => {
        nameById.set(u.user_id, u.player_name);
      });
    }
    return data.map((r: {
      alias_lower: string;
      canonical_name: string;
      created_at: string;
      created_by: string | null;
    }) => ({
      aliasLower: r.alias_lower,
      canonicalName: r.canonical_name,
      createdAt: r.created_at,
      createdByName: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
    }));
  } catch {
    return [];
  }
}

export async function addAlias(
  aliasInput: string,
  canonicalName: string,
): Promise<void> {
  const trimmed = aliasInput.trim();
  const canonical = canonicalName.trim();
  if (!trimmed || !canonical) {
    throw new Error("Both fields are required.");
  }
  if (trimmed.toLowerCase() === canonical.toLowerCase()) {
    throw new Error("Alias and canonical are the same — nothing to merge.");
  }
  const sb = createSupabaseBrowserClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from(TABLE).insert({
    alias_lower: trimmed.toLowerCase(),
    canonical_name: canonical,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
  void recordAudit("alias", trimmed.toLowerCase(), "add", { canonical });
}

export async function deleteAlias(aliasLower: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from(TABLE).delete().eq("alias_lower", aliasLower);
  if (error) throw error;
  void recordAudit("alias", aliasLower, "remove");
}
