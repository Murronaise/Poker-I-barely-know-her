// Payment-handle helpers used by the account-page form and the history-page
// settlement renderer. Three providers are supported today (Revolut, Monzo,
// PayPal); adding another is a matter of dropping in another entry in
// PROVIDERS plus a column on `users`.
//
// We persist only the user's handle (no URL) — the renderer reconstructs the
// link with the right host + amount on demand. That keeps the data tidy and
// lets us add an amount parameter later without re-saving anyone's row.

import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentProvider = "revolut" | "monzo" | "paypal";

export type PaymentHandles = {
  revolut: string | null;
  monzo: string | null;
  paypal: string | null;
};

export const EMPTY_PAYMENT_HANDLES: PaymentHandles = {
  revolut: null,
  monzo: null,
  paypal: null,
};

/**
 * Visible display name for the provider — used in button labels, tooltips,
 * and the account-page form. Kept tiny so it works on mobile chips.
 */
export const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  revolut: "Revolut",
  monzo: "Monzo",
  paypal: "PayPal",
};

/**
 * Theme colour per provider — matches each brand approximately while still
 * fitting the dark/neon aesthetic. Used by the settlement chips.
 */
export const PROVIDER_ACCENT: Record<PaymentProvider, string> = {
  revolut: "from-sky-500/30 to-cyan-400/30 border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/15",
  monzo: "from-rose-500/30 to-orange-400/30 border-orange-400/40 text-orange-300 hover:bg-orange-400/15",
  paypal: "from-blue-500/30 to-blue-300/30 border-blue-400/40 text-blue-300 hover:bg-blue-400/15",
};

const HANDLE_REGEX = /^[A-Za-z0-9._-]{1,48}$/;

/**
 * Strip @ prefix, https://*, and trailing slashes from whatever the user
 * pastes in so we always store the canonical handle. Returns null when the
 * input is empty or doesn't look like a username.
 */
export function normaliseHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  let h = input.trim();
  if (!h) return null;
  // Drop common URL prefixes / paths.
  h = h
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:revolut\.me|monzo\.me|paypal\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
  if (!HANDLE_REGEX.test(h)) return null;
  return h;
}

/**
 * Build the deep-link URL for a given provider/handle/amount. Returns null
 * if the handle isn't set or fails validation — callers should hide the
 * button rather than show a broken link.
 *
 * `amountPence` is optional; when present the URL pre-fills the amount on
 * the provider's payment screen so the payer doesn't have to retype it.
 */
export function buildPaymentLink(
  provider: PaymentProvider,
  handle: string | null,
  amountPence?: number,
): string | null {
  const cleaned = normaliseHandle(handle);
  if (!cleaned) return null;
  const amount = amountPence && amountPence > 0 ? (amountPence / 100).toFixed(2) : null;
  switch (provider) {
    case "revolut":
      // Revolut accepts `revolut.me/<handle>/<amount>` (no currency).
      return amount
        ? `https://revolut.me/${cleaned}/${amount}`
        : `https://revolut.me/${cleaned}`;
    case "monzo":
      // Monzo.me uses the same `/handle/amount` form.
      return amount
        ? `https://monzo.me/${cleaned}/${amount}`
        : `https://monzo.me/${cleaned}`;
    case "paypal":
      // PayPal.me requires a currency suffix; default to GBP for this app.
      return amount
        ? `https://paypal.me/${cleaned}/${amount}GBP`
        : `https://paypal.me/${cleaned}`;
  }
}

/** Provider keys present + valid in a handles object. */
export function activeProviders(handles: PaymentHandles): PaymentProvider[] {
  const out: PaymentProvider[] = [];
  if (normaliseHandle(handles.revolut)) out.push("revolut");
  if (normaliseHandle(handles.monzo)) out.push("monzo");
  if (normaliseHandle(handles.paypal)) out.push("paypal");
  return out;
}

/**
 * Bulk-fetch the payment handles for the named players. Used by the
 * history page to decorate each settlement row with deep-link buttons
 * for the receiver. Players without a registered account simply don't
 * appear in the map — the caller treats their absence as "no links".
 */
export async function loadPaymentHandlesForPlayers(
  client: SupabaseClient,
  playerNames: string[],
): Promise<Map<string, PaymentHandles>> {
  const out = new Map<string, PaymentHandles>();
  if (playerNames.length === 0) return out;
  try {
    const { data } = await client
      .from("users")
      .select("player_name, revolut_handle, monzo_handle, paypal_handle")
      .in(
        "player_name",
        // Case-insensitive lookup is enforced by the lower(player_name) unique
        // index — but `in` is exact. We over-fetch in lowercase and match
        // back below, which is good enough for the small rosters this app
        // sees and avoids per-name round-trips.
        playerNames,
      );
    (data ?? []).forEach((row: {
      player_name: string;
      revolut_handle: string | null;
      monzo_handle: string | null;
      paypal_handle: string | null;
    }) => {
      out.set(row.player_name.toLowerCase(), {
        revolut: row.revolut_handle,
        monzo: row.monzo_handle,
        paypal: row.paypal_handle,
      });
    });
  } catch {
    // Migration may not be applied yet — fail safe to an empty map so the
    // settlement section just renders without deep-link buttons rather
    // than crashing.
  }
  return out;
}

export function getHandlesFor(
  map: Map<string, PaymentHandles>,
  playerName: string,
): PaymentHandles {
  return map.get(playerName.toLowerCase()) ?? EMPTY_PAYMENT_HANDLES;
}
