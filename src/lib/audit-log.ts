// Append-only audit log. Every admin action that mutates state writes an
// audit row so we have a paper trail across devices — settlement toggles,
// deletes, restores, edits, alias additions, etc.
//
// Writes are fire-and-forget: we never want a slow audit insert to block
// the user-visible action. Errors are logged to console; the audit row is
// best-effort.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";

export type AuditEntityType = "game" | "settlement" | "player" | "note" | "alias";

export type AuditEntry = {
  id: number;
  ts: string;
  actorId: string | null;
  actorName: string | null;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  details: Record<string, unknown> | null;
};

/**
 * Insert one audit row, best-effort. Resolves to true on success and false
 * on any failure — callers should not branch on the result; the audit log
 * is observational, not a gate.
 */
export async function recordAudit(
  entityType: AuditEntityType,
  entityId: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const sb = createSupabaseBrowserClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    // Try to grab the actor's display name from their users row so the
    // audit panel can show "Toby deleted game X" without a per-row join.
    const { data: profile } = await sb
      .from("users")
      .select("player_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const { error } = await sb.from("audit_log").insert({
      actor_id: user.id,
      actor_name: profile?.player_name ?? null,
      entity_type: entityType,
      entity_id: entityId,
      action,
      details: details ?? null,
    });
    if (error) {
      console.warn("[audit] insert failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[audit] unexpected error", err);
    return false;
  }
}

/**
 * Admin-only read of recent audit entries. Returns at most `limit` rows
 * (default 100) ordered newest first. RLS rejects non-admins and yields
 * an empty array.
 */
export async function fetchRecentAudit(
  client: SupabaseClient,
  limit = 100,
): Promise<AuditEntry[]> {
  try {
    const { data, error } = await client
      .from("audit_log")
      .select("id, ts, actor_id, actor_name, entity_type, entity_id, action, details")
      .order("ts", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r: {
      id: number;
      ts: string;
      actor_id: string | null;
      actor_name: string | null;
      entity_type: string;
      entity_id: string;
      action: string;
      details: Record<string, unknown> | null;
    }) => ({
      id: r.id,
      ts: r.ts,
      actorId: r.actor_id,
      actorName: r.actor_name,
      entityType: r.entity_type as AuditEntityType,
      entityId: r.entity_id,
      action: r.action,
      details: r.details,
    }));
  } catch {
    return [];
  }
}
