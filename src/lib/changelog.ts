export type ChangelogItemType = "feature" | "fix" | "improvement" | "breaking";

export type ChangelogItem = {
  type: ChangelogItemType;
  text: string;
  /**
   * Hide from non-admin viewers. Use for admin tools, internal/technical
   * fixes, and anything a player has no UI surface to interact with.
   */
  adminOnly?: boolean;
  /**
   * Higher-level theme inside a release (e.g. "Game Polls", "Auth"). When a
   * release ships several feature areas at once, this lets the changelog page
   * render category sections instead of one undifferentiated list.
   */
  category?: string;
};

export type ChangelogEntry = {
  version: string;
  date: string;
  /** One-line tagline shown in the version header — describes the release. */
  summary?: string;
  items: ChangelogItem[];
};

// Most recent first.
export const changelog: ChangelogEntry[] = [
  {
    version: "1.6.3",
    date: "May 8, 2026",
    summary: "Settlement now mirrors actual money movement — full buy-ins and cash-outs, not just net",
    items: [
      { category: "Settlement", type: "breaking", text: "Buy-ins (and rebuys) are now transferred to Toby up front during the game via the existing rebuy flow — settlement records the full transfers rather than just net winnings/losses" },
      { category: "Settlement", type: "feature", text: "Owing rows now show full Buy-in + Food (e.g. £100 + £11.80 = £111.80), so you can match it against what you transferred during the game" },
      { category: "Settlement", type: "feature", text: "Receiving rows now show full Cash-out, not just profit — every winner gets a row showing exactly what Toby pays back" },
      { category: "Settlement", type: "improvement", text: "Each player can appear in both lists at once: one row for what they sent in, one for what they get back, so every leg of the money flow is visible" },
    ],
  },
  {
    version: "1.6.2",
    date: "May 8, 2026",
    summary: "Settlement clarity — winners get a payout row, food nets against winnings, paid status visible to everyone",
    items: [
      { category: "Settlement", type: "fix", text: "Winners' food cost is now absorbed by their winnings — if you walked away up more than your food share, you no longer appear as 'owing' anything" },
      { category: "Settlement", type: "feature", text: "Settlement section now shows a green row per winner with how much they're owed back from the pot (e.g. 'Won £25 − Food £11.80')" },
      { category: "Settlement", type: "improvement", text: "Game only flips to 'Settled' once both directions are ticked — every loser has paid AND every winner has been paid out" },
      { category: "Settlement", type: "fix", text: "Paid / Owing badges are now visible to every player, not just the admin — shared state lives in Supabase instead of the admin's browser" },
      { category: "Settlement", type: "improvement", text: "Mark Paid button shows a spinner while the toggle is in flight and reverts on failure (e.g. lost connection)" },
      { category: "Settlement", type: "breaking", text: "Existing localStorage 'paid' marks were not migrated — admin will need to re-tick any games marked paid before this update", adminOnly: true },
      { category: "Settlement", type: "feature", text: "New game_settlements Supabase table backs paid state, with admin-only write RLS as defence-in-depth", adminOnly: true },
    ],
  },
  {
    version: "1.6.1",
    date: "May 7, 2026",
    summary: "Mobile polish pass — readable winners, breathable layouts, fewer mystery buttons",
    items: [
      // ---- Dashboard --------------------------------------------------------
      { category: "Dashboard", type: "improvement", text: "Removed the 'Dashboard' title and date strip — phones get more room for the cards below" },
      { category: "Dashboard", type: "improvement", text: "Top stat cards line up at the same height again — long labels like 'Total Volume' no longer wrap and stretch one card" },
      { category: "Dashboard", type: "improvement", text: "Marquee row of player superlatives now auto-scrolls on phones too; pause-on-touch lets you swipe through it" },
      { category: "Dashboard", type: "improvement", text: "Recent panel is back on mobile — stacks below the lifetime profit chart with a scroll inside" },
      { category: "Dashboard", type: "improvement", text: "Lifetime profit chart pans horizontally on phones so all eight player names stay readable" },
      { category: "Dashboard", type: "fix", text: "Recent winner now leads with the cash-out figure (e.g. £81.50) and shows the profit underneath — was easy to read the £56.50 net as a final stack" },
      { category: "Dashboard", type: "fix", text: "Live-game button now only shows when there's actually a live game today — opening a poll no longer made it appear" },
      { category: "Dashboard", type: "improvement", text: "Live-game button renamed 'Join Live Game' so it works for everyone, not just the host" },

      // ---- Leaderboards + Profile ------------------------------------------
      { category: "Leaderboards + Profile", type: "fix", text: "Top-3 podium names get their own row on mobile — no more truncated 'Tris…' between the rank and win-rate columns" },
      { category: "Leaderboards + Profile", type: "fix", text: "Profile picture editing locked to the linked account's owner (or admin) so randoms can't overwrite someone else's photo" },
      { category: "Leaderboards + Profile", type: "improvement", text: "'Net' / 'Net Profit' labels renamed to 'Profit' across the app for consistency" },

      // ---- Settlement + History --------------------------------------------
      { category: "Settlement + History", type: "fix", text: "Settlement breakdown ('Poker £X + Food £Y') now sits on its own row on mobile so it stops overlapping 'owes Toby'" },
      { category: "Settlement + History", type: "fix", text: "Historic results totals strip — Buy-ins, Food and Pot get proper spacing on mobile and stop crowding each other" },
      { category: "Settlement + History", type: "improvement", text: "Winner column on the games list shows cash-out + profit so the headline number matches what people walked away with" },

      // ---- Polls -----------------------------------------------------------
      { category: "Polls", type: "fix", text: "Polls page now loads the existing poll first time on mobile — no more empty list until you pull-to-refresh" },
    ],
  },
  {
    version: "1.6.0",
    date: "May 6, 2026",
    summary: "Big drop — accounts, polls, player linking, and a settlement rework",
    items: [
      // ---- Brand + Navbar ---------------------------------------------------
      { category: "Brand + Navigation", type: "improvement", text: "New navbar layout: brand left, links centred, status chips right — easier to scan" },
      { category: "Brand + Navigation", type: "feature", text: "Custom poker-chip logo with subtle breathing glow and shimmering gradient wordmark — spins on hover" },
      { category: "Brand + Navigation", type: "improvement", text: "Account chip now shows your avatar + name, with a chevron and admin shield where applicable" },
      { category: "Brand + Navigation", type: "feature", text: "Account dropdown opens with profile header (avatar, name, email) and animated reveal" },
      { category: "Brand + Navigation", type: "improvement", text: "Active nav link gets a glowing dot that slides between tabs as you navigate" },
      { category: "Brand + Navigation", type: "fix", text: "LIVE badge no longer lingers past the day the game was actually played — stale entries clear automatically" },

      // ---- Player Linking ---------------------------------------------------
      { category: "Player Linking", type: "feature", text: "Verified badges on player profiles and the roster when a registered user owns the name" },
      { category: "Player Linking", type: "feature", text: "Account page now shows a 'Your Profile' card linking to your historical stats" },
      { category: "Player Linking", type: "feature", text: "Signup detects whether your chosen name has historical sessions and shows the count" },
      { category: "Player Linking", type: "improvement", text: "(You) badge highlights your own profile when viewing it" },

      // ---- Game Polls + RSVPs ----------------------------------------------
      { category: "Game Polls + RSVPs", type: "feature", text: "Game polls — RSVP Yes/Maybe/No per day for an upcoming weekend" },
      { category: "Game Polls + RSVPs", type: "feature", text: "Confirmed games show 'Add to Google Calendar' and '.ics download' buttons" },
      { category: "Game Polls + RSVPs", type: "feature", text: "Share-to-WhatsApp button on every poll opens WhatsApp with a pre-typed message for your group" },
      { category: "Game Polls + RSVPs", type: "feature", text: "Dashboard banner surfaces unresponded polls and upcoming confirmed games" },
      { category: "Game Polls + RSVPs", type: "feature", text: "Polls list page at /games/poll showing every past and current poll" },
      { category: "Game Polls + RSVPs", type: "improvement", text: "Vote chips show who said yes/maybe/no per option, not just totals" },
      { category: "Game Polls + RSVPs", type: "feature", text: "Polls restricted to first and last weekend of each month (with manual override)", adminOnly: true },
      { category: "Game Polls + RSVPs", type: "feature", text: "Auto-detects UK bank holidays — Sunday offered when the following Monday is a bank holiday", adminOnly: true },
      { category: "Game Polls + RSVPs", type: "feature", text: "Force re-poll flow when confirmed yeses drop below the minimum (default 4)", adminOnly: true },
      { category: "Game Polls + RSVPs", type: "feature", text: "Post-login modal pops up if there's an open poll you haven't voted on yet — quick-vote chips inline" },

      // ---- Accounts + Authentication ---------------------------------------
      { category: "Accounts + Authentication", type: "feature", text: "Create your own account with a player name and password" },
      { category: "Accounts + Authentication", type: "feature", text: "Account page: edit player name, change password, log out" },
      { category: "Accounts + Authentication", type: "feature", text: "Forgot password / password reset flow via email" },
      { category: "Accounts + Authentication", type: "feature", text: "Email confirmation handled gracefully on signup ('Check your inbox')" },
      { category: "Accounts + Authentication", type: "feature", text: "Navbar shows player name with dropdown for Account Settings and Logout" },
      { category: "Accounts + Authentication", type: "feature", text: "Mobile menu now includes auth controls so phone users can log in/out without scrolling" },
      { category: "Accounts + Authentication", type: "improvement", text: "Player name validation (2–24 characters, case-insensitive uniqueness)" },
      { category: "Accounts + Authentication", type: "improvement", text: "Password validation (8+ characters, must include letter and number)" },
      { category: "Accounts + Authentication", type: "improvement", text: "Login error messages translated from raw Supabase strings to actionable hints" },
      { category: "Accounts + Authentication", type: "improvement", text: "Logged-in users redirected away from /login and /signup automatically" },
      { category: "Accounts + Authentication", type: "improvement", text: "Account page uses skeleton loader instead of a flash of empty state" },
      { category: "Accounts + Authentication", type: "feature", text: "Two roles — admin and player — with admin-only gates on game creation, polls, settlement, and edits", adminOnly: true },
      { category: "Accounts + Authentication", type: "fix", text: "Auto-create user profile row on first account-page visit if the auth-trigger hasn't fired", adminOnly: true },

      // ---- Settlement + Mobile polish --------------------------------------
      { category: "Settlement + Mobile", type: "feature", text: "Settlement system redesigned: all poker payments now flow to admin instead of peer-to-peer" },
      { category: "Settlement + Mobile", type: "feature", text: "Tick off settlements one player at a time — game auto-marks settled when everyone has paid" },
      { category: "Settlement + Mobile", type: "feature", text: "Changelog page to track version history and updates" },
      { category: "Settlement + Mobile", type: "improvement", text: "Settlement card readability — clearer breakdown of poker loss vs food spend, lighter sub-text" },
      { category: "Settlement + Mobile", type: "improvement", text: "Mobile responsiveness: collapsible game sections default collapsed on mobile" },
      { category: "Settlement + Mobile", type: "improvement", text: "Mobile scaling: fixed font sizes and card layouts for 375px viewports" },
      { category: "Settlement + Mobile", type: "improvement", text: "Player profile pictures now display in game history and settlement cards" },
      { category: "Settlement + Mobile", type: "improvement", text: "Profile page: replaced VPIP with Avg Buy-In statistic" },
      { category: "Settlement + Mobile", type: "improvement", text: "Head-to-Head section: display net profit/loss against each opponent" },
      { category: "Settlement + Mobile", type: "improvement", text: "Modal dialogs scroll on short mobile viewports instead of clipping" },
      { category: "Settlement + Mobile", type: "improvement", text: "Profile picture centered properly on mobile profile pages" },
      { category: "Settlement + Mobile", type: "fix", text: "Settlement no longer adds winners' poker net to the amount they owe — winners only owe for food" },
      { category: "Settlement + Mobile", type: "fix", text: "Profile name and 'OWES TOBY' label now visually distinct" },
      { category: "Settlement + Mobile", type: "breaking", text: "Removed Blinds and Venue cards from historical game summary (redundant with main heading)" },
      { category: "Settlement + Mobile", type: "feature", text: "Reset button on a settled game lets admins re-open it if it was marked too early", adminOnly: true },
      { category: "Settlement + Mobile", type: "feature", text: "Edit and delete games with admin-only access via localStorage overlay", adminOnly: true },
      { category: "Settlement + Mobile", type: "feature", text: "Blind structure templates: save and reuse custom blind schedules", adminOnly: true },
    ],
  },
  {
    version: "1.2.0",
    date: "April 15, 2026",
    summary: "Live game tracking essentials",
    items: [
      { type: "feature", text: "Food expense tracking separate from poker settlement" },
      { type: "improvement", text: "Leaderboard categories and player rankings" },
      { type: "fix", text: "Fixed chip stack animation physics on dashboard" },
      { type: "feature", text: "Blind timer with level progression and keyboard shortcuts", adminOnly: true },
      { type: "feature", text: "Rebuy tracking during live games", adminOnly: true },
    ],
  },
  {
    version: "1.1.0",
    date: "March 1, 2026",
    summary: "Visual polish + dashboard",
    items: [
      { type: "feature", text: "Player avatar upload and custom cropping" },
      { type: "feature", text: "Game statistics dashboard with profit charts" },
      { type: "improvement", text: "Enhanced player profiles with lifetime stats" },
    ],
  },
  {
    version: "1.0.0",
    date: "February 1, 2026",
    summary: "Initial release",
    items: [
      { type: "feature", text: "Initial Poker Tracker release" },
      { type: "feature", text: "Live game tracking with buy-ins, cash-outs, and settlement" },
      { type: "feature", text: "Game history and player leaderboards" },
      { type: "feature", text: "Premium dark theme with neon green accents" },
    ],
  },
];

// ---- Derived helpers ------------------------------------------------------

const TYPE_LABEL: Record<ChangelogItemType, string> = {
  feature: "New",
  improvement: "Improved",
  fix: "Fixed",
  breaking: "Breaking",
};

/** Stable type-display order so groups always render the same way. */
export const TYPE_ORDER: ChangelogItemType[] = ["feature", "improvement", "fix", "breaking"];

export function typeLabel(t: ChangelogItemType): string {
  return TYPE_LABEL[t];
}

/** Group an entry's items by type, preserving in-group order. */
export function groupItemsByType(
  items: ChangelogItem[],
): Record<ChangelogItemType, ChangelogItem[]> {
  const out: Record<ChangelogItemType, ChangelogItem[]> = {
    feature: [],
    improvement: [],
    fix: [],
    breaking: [],
  };
  for (const item of items) out[item.type].push(item);
  return out;
}

/** Per-type counts shown in the entry header (e.g. "6 new · 4 improved"). */
export function summariseCounts(items: ChangelogItem[]): string {
  const counts = groupItemsByType(items);
  return TYPE_ORDER
    .filter((t) => counts[t].length > 0)
    .map((t) => `${counts[t].length} ${TYPE_LABEL[t].toLowerCase()}`)
    .join(" · ");
}

/**
 * Strip admin-only items unless `viewerIsAdmin` is true. Empty entries
 * (everything was admin-only) are dropped. Used by the changelog page so
 * non-admins don't see admin-tool announcements they have no use for.
 */
export function filterChangelogForViewer(
  entries: ChangelogEntry[],
  viewerIsAdmin: boolean,
): ChangelogEntry[] {
  if (viewerIsAdmin) return entries;
  return entries
    .map((e) => ({ ...e, items: e.items.filter((i) => !i.adminOnly) }))
    .filter((e) => e.items.length > 0);
}

/**
 * Split an entry's items into named category groups, preserving the order
 * categories first appear in the source data. Items without a category fall
 * into a single anonymous group rendered first. Returns an empty array when
 * the entry has no items at all (e.g. fully filtered for non-admins).
 */
export type CategoryGroup = { name: string | null; items: ChangelogItem[] };

export function groupItemsByCategory(items: ChangelogItem[]): CategoryGroup[] {
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, ChangelogItem[]>();
  for (const item of items) {
    const key = item.category ?? null;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }
  // Render uncategorised items first when both exist — that way one-off
  // entries don't end up under a confusing "no category" header.
  return order
    .sort((a, b) => (a === null ? -1 : b === null ? 1 : 0))
    .map((name) => ({ name, items: buckets.get(name)! }));
}
