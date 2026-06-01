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
    version: "1.7.6",
    date: "June 1, 2026",
    summary: "Pages no longer flash old numbers before settling on the right ones",
    items: [
      { category: "Polish", type: "fix", text: "Most pages briefly showed stale figures — older session counts, lower lifetime totals, wrong 'Unsettled' badges — before snapping to the correct values a moment after loading. Pages now show a brief loading shimmer and paint the real numbers once, so nothing flickers between wrong and right." },
      { category: "Polish", type: "improvement", text: "The dashboard's chip-stack chart now drops into place a single time with the real data, instead of animating the seed data and then re-animating after the live numbers arrive." },
      { category: "Polish", type: "improvement", text: "After the first data page loads, moving between the dashboard, games, stats, players, and profiles renders instantly from a shared in-memory cache — no repeat loading shimmer.", adminOnly: true },
    ],
  },
  {
    version: "1.7.5",
    date: "May 24, 2026",
    summary: "Polls page no longer hangs on skeleton cards; anon visitors get a prompt to log in for upcoming games",
    items: [
      { category: "Scheduling", type: "fix", text: "Polls page would sometimes stay stuck on its skeleton cards until you refreshed — a query error was swallowed before the loading flag could clear. Now the page always finishes loading, even if a fetch fails." },
      { category: "Scheduling", type: "feature", text: "Anonymous visitors landing on the dashboard with a confirmed game in the next 7 days now see a 'Game on — log in to RSVP' banner that deep-links to the login page." },
    ],
  },
  {
    version: "1.7.4",
    date: "May 24, 2026",
    summary: "Dashboard nudges non-voters once a game day is confirmed",
    items: [
      { category: "Scheduling", type: "feature", text: "Dashboard now shows a yellow 'RSVP needed' banner to anyone who hasn't voted on a confirmed game day inside the next 7 days. Saying yes, maybe, or no all dismiss it — silence does not." },
    ],
  },
  {
    version: "1.7.3",
    date: "May 24, 2026",
    summary: "Retired chip-stack photos on historic games",
    items: [
      { category: "Polish", type: "improvement", text: "Removed the chip-stack photo panel from historic game pages. The end-of-game chip-mismatch check already forces buy-ins and cash-outs to reconcile before a game can be finalised, so the photo evidence was no longer earning its keep." },
    ],
  },
  {
    version: "1.7.2",
    date: "May 24, 2026",
    summary: "One poll per month, auto-created at game-end, spanning the calendar boundary",
    items: [
      { category: "Scheduling", type: "feature", text: "Ending a live game now auto-creates the next month's poll. It spans two weekends — the last weekend of the current month and the first weekend of the next — so the group has one rolling poll with built-in flex around the calendar boundary." },
      { category: "Scheduling", type: "improvement", text: "Each weekend in a poll offers Friday and Saturday by default. Sunday only appears when the following Monday is a UK bank holiday, so we never accidentally suggest a school-night start." },
      { category: "Scheduling", type: "improvement", text: "Verdict logic is now per-option: the cron looks at every still-future date in a poll, picks the leading one, and only confirms/cancels when that date is inside the 7-day window. A poll spanning two weekends can lock the early option early or wait for votes on the later one." },
      { category: "Scheduling", type: "improvement", text: "The daily housekeeping cron no longer auto-creates polls — creation only happens at game-end or when an admin makes one by hand. Removes the empty-scaffold polls that were appearing once a day.", adminOnly: true },
    ],
  },
  {
    version: "1.7.1",
    date: "May 24, 2026",
    summary: "Polls decide themselves a week ahead — and stay open for late RSVPs",
    items: [
      { category: "Scheduling", type: "improvement", text: "Polls now get a verdict 1 week before game day instead of waiting until 24 hours out: whichever date has the most yes votes is locked in automatically, provided at least 4 people have said yes to it." },
      { category: "Scheduling", type: "improvement", text: "Polls that don't hit the 4-yes threshold by 1 week out get cancelled at the same time — no more silent under-quorum drift right up to the day before." },
      { category: "Scheduling", type: "feature", text: "Once a date is confirmed, you can still RSVP yes/maybe/no on it — handy for last-minute joiners. The other dates lock so the verdict can't flip." },
      { category: "Scheduling", type: "fix", text: "Auto-created scaffold polls with no dates populated are no longer cancelled by the housekeeping cron — they just stay open until an admin fills them in.", adminOnly: true },
    ],
  },
  {
    version: "1.7.0",
    date: "May 18, 2026",
    summary: "Pay-now buttons, achievements, yearly recap, and a heap of admin tooling",
    items: [
      // Settlement / money
      { category: "Settlement", type: "feature", text: "One-tap pay buttons on every settlement row — Revolut, Monzo, and PayPal links with the exact amount pre-filled. Set your handles in Account → Payment handles." },
      { category: "Settlement", type: "feature", text: "Running balance ledger on every profile shows how much you still owe Toby (or vice versa) across every game, with a per-session breakdown." },
      { category: "Settlement", type: "improvement", text: "Settled rows now show 'Paid 2h ago · by Toby' so it's obvious who marked the tick and when. Pay buttons disappear once a row is settled so you don't accidentally double-pay." },
      { category: "Settlement", type: "feature", text: "Admin dashboard banner sums all outstanding balances across the table — 'they owe you £X / you owe £Y' with one tap to /players.", adminOnly: true },
      // Profiles / engagement
      { category: "Profile", type: "feature", text: "Achievements grid: 11 stackable badges including Hat Trick, Five-Timer, Big Spender, Comeback Kid, and Centurion. Locked badges show a progress bar so you can see how close you are." },
      { category: "Profile", type: "feature", text: "Personal Bests section: biggest win + loss with the night they happened, longest win and losing streaks, debut date." },
      // Game-night UX
      { category: "Live Game", type: "feature", text: "Photos can now be attached to a specific player — tap their avatar in the Photos panel to upload a chip-stack shot tagged to them. General shots for food and table scenes still work the same way." },
      { category: "Live Game", type: "feature", text: "Sound pack — distinct synth cues for bust (sad descending two-tone), rebuy (ka-ching), level-up (cascade), and game finalize (arpeggio). Same mute toggle as before." },
      { category: "Live Game", type: "fix", text: "Live game state now survives a hard refresh — buy-ins, busts, rebuys, the event log, and the timer all restore from sessionStorage. Marathon games past midnight no longer get wiped." },
      // Scheduling
      { category: "Scheduling", type: "feature", text: "iCal feed at /api/calendar.ics — subscribe from any calendar app to get confirmed game nights + historical sessions automatically." },
      { category: "Scheduling", type: "feature", text: "Daily housekeeping cron auto-cancels under-quorum polls inside the 24h window and auto-creates polls for the next first/last weekend of each month so you never have to remember." },
      { category: "Scheduling", type: "feature", text: "Weekly settlement-reminder cron posts a Discord/Slack summary of debts older than a week.", adminOnly: true },
      // Admin
      { category: "Admin", type: "feature", text: "Private per-game notes panel on every history page — context, disputes, anything worth remembering. Admin-only.", adminOnly: true },
      { category: "Admin", type: "feature", text: "/admin/restore page — soft-deleted games show up here for one-click restore instead of being gone forever.", adminOnly: true },
      { category: "Admin", type: "feature", text: "/admin/merge page — collapse duplicate name variants (toby/Toby/tobby) into one canonical entry. Detects case-different duplicates and suggests them.", adminOnly: true },
      { category: "Admin", type: "feature", text: "Audit log captures every admin mutation (delete, restore, edit, mark-paid, alias add).", adminOnly: true },
      // Engagement / recap
      { category: "Recap", type: "feature", text: "Yearly recap page at /recap/<year> — totals, Money Printer / The Pit / Furniture / Foodie cards, single-night peaks, year-end leaderboard. Auto-surfaces on the dashboard during December and for the prior year Jan–Nov." },
      // Mobile / PWA
      { category: "Mobile", type: "feature", text: "Installable as a PWA — Add to Home Screen on iOS / Android. Service worker pre-caches the offline shell so a flaky connection at the table doesn't dump you onto the dino page." },
      // Smaller fixes from the site review
      { category: "Polish", type: "fix", text: "New signups now show up immediately on the players roster and the dashboard player count, not just after they've played a session." },
      { category: "Polish", type: "fix", text: "Finalized-game results table on portrait phones now scrolls horizontally instead of cramming all five columns into one width." },
      { category: "Polish", type: "fix", text: "Dashboard 'Probably Cheating', 'Mortgage Material', etc. now derive their leader names from real data — they were previously hard-coded and could lie after a new session." },
      { category: "Polish", type: "improvement", text: "Settlement model rephrased internally — admin and food payer are now separable concepts even though they're the same person today, paving the way for a future where someone else hosts." },
      { category: "Polish", type: "fix", text: "Player names with double-spaces or trailing hyphens are now rejected at signup — was rendering oddly across the site." },
      { category: "Polish", type: "fix", text: "Long player names wrap to two lines instead of being truncated mid-word on the roster." },
      { category: "Polish", type: "improvement", text: "Avatar upload now validates MIME type + size client-side so users get an instant error instead of a silent storage rejection." },
      { category: "Polish", type: "fix", text: "Dashboard 'Open Poll' banner now routes to the polls list when multiple polls are open, rather than burying the others behind a single deep link." },
      { category: "Polish", type: "fix", text: "Poll detail page now shows voter chips for Maybe and No, not just Yes." },
    ],
  },
  {
    version: "1.6.6",
    date: "May 8, 2026",
    summary: "Single end-of-night transfer per player — no more upfront buy-in transfers",
    items: [
      { category: "Settlement", type: "breaking", text: "Buy-ins are no longer transferred upfront during the game. Track rebuys in-app as normal — at the end you'll have one number per player, settled with Toby in a single transfer either way." },
      { category: "Settlement", type: "improvement", text: "Each settlement row total = Cash-out − Buy-in − Food. Negative means you pay Toby, positive means Toby pays you. Same number that's been in the breakdown all along, just now it's the headline figure." },
      { category: "Settlement", type: "improvement", text: "One row per player on the settlement page — no more split owing/receiving rows for the same person. Cleaner to scan and one Mark Paid tick per player covers the whole night." },
    ],
  },
  {
    version: "1.6.5",
    date: "May 8, 2026",
    summary: "Admin-only Site Activity panel — see who's visiting and when",
    items: [
      { category: "Admin", type: "feature", text: "New Site Activity panel for admins: a grouped list of every visitor (signed-in or anonymous) with last-seen timestamp and visit count. Click a visitor to see their full page-by-page history.", adminOnly: true },
      { category: "Admin", type: "feature", text: "Site Activity entry point lives next to Account Settings on the admin's own profile and is invisible to everyone else.", adminOnly: true },
      { category: "Admin", type: "feature", text: "Anonymous visitors are tracked via a long-lived cookie so their sessions group into a single visitor entry instead of fragmenting per-page.", adminOnly: true },
      { category: "Admin", type: "improvement", text: "Visit logging is rate-limited to once per path per visitor per minute so a heavy navigation session doesn't spam the table.", adminOnly: true },
    ],
  },
  {
    version: "1.6.4",
    date: "May 8, 2026",
    summary: "Profile is your home — picture, name, and settings all in one place",
    items: [
      { category: "Profile", type: "fix", text: "Profile-picture upload + frame controls now actually appear on your own profile once your account is linked to a player name — auth check was looking in the wrong storage and never saw your session" },
      { category: "Profile", type: "improvement", text: "Navbar dropdown 'Account Settings' is now 'Profile' and takes you straight to your own profile page (where the avatar editor lives)" },
      { category: "Profile", type: "improvement", text: "Account Settings (player name, password, logout) reachable via a button on your profile when you're viewing your own page" },
      { category: "Profile", type: "improvement", text: "Failed avatar uploads now log the underlying Supabase error to the console instead of silently swallowing it" },
    ],
  },
  {
    version: "1.6.3",
    date: "May 8, 2026",
    summary: "Settlement reflects upfront buy-in transfers — only food and cash-out are settled at game end",
    items: [
      { category: "Settlement", type: "breaking", text: "Buy-ins (and rebuys) are now transferred to Toby up front during the game via the existing rebuy flow — by game end the only outstanding amounts are food owed to Toby and cash-out owed back to you" },
      { category: "Settlement", type: "improvement", text: "Settlement total per player is now Cash-out − Food (since buy-in is already paid). One row per player: receive if cash-out beats food, owe the difference if not" },
      { category: "Settlement", type: "improvement", text: "Row breakdown shows Buy-in · Cash-out · Food so the upfront transfer stays visible alongside what's still pending" },
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
