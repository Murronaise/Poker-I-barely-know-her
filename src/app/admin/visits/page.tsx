import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Eye, Clock, Users, Link as LinkIcon, ExternalLink } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminDb } from "@/lib/auth";

type SiteVisitRow = {
  id: string;
  visitor_key: string;
  user_id: string | null;
  email: string | null;
  player_name: string | null;
  path: string;
  user_agent: string | null;
  referer: string | null;
  visited_at: string;
};

const RECENT_FETCH_LIMIT = 5000;

export const dynamic = "force-dynamic";

export default async function AdminVisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ visitor?: string }>;
}) {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const userIsAdmin = await isAdminDb(sb, user?.email);
  if (!userIsAdmin) redirect("/");

  const params = await searchParams;
  const focusedKey = params.visitor ?? null;

  const { data: rowsRaw, error } = await sb
    .from("site_visits")
    .select("*")
    .order("visited_at", { ascending: false })
    .limit(RECENT_FETCH_LIMIT);
  if (error) {
    console.error("[admin/visits] fetch failed", error);
  }
  const rows: SiteVisitRow[] = (rowsRaw ?? []) as SiteVisitRow[];

  if (focusedKey) {
    const visitorRows = rows.filter((r) => r.visitor_key === focusedKey);
    if (visitorRows.length === 0) notFound();
    return <VisitorDetail focusedKey={focusedKey} visits={visitorRows} />;
  }

  return <VisitorList rows={rows} />;
}

// ---------------------------------------------------------------------------

function VisitorList({ rows }: { rows: SiteVisitRow[] }) {
  // Group by visitor_key, keeping the most-recent identifying info per group.
  type Group = {
    key: string;
    lastSeen: string;
    firstSeen: string;
    visitCount: number;
    latestPlayerName: string | null;
    latestEmail: string | null;
    lastPath: string;
  };
  const groups = new Map<string, Group>();
  // rows are already sorted desc by visited_at; iterate so the *first* row
  // we see for a key is its most recent visit.
  for (const r of rows) {
    const existing = groups.get(r.visitor_key);
    if (!existing) {
      groups.set(r.visitor_key, {
        key: r.visitor_key,
        lastSeen: r.visited_at,
        firstSeen: r.visited_at,
        visitCount: 1,
        latestPlayerName: r.player_name,
        latestEmail: r.email,
        lastPath: r.path,
      });
    } else {
      existing.visitCount += 1;
      existing.firstSeen = r.visited_at; // keeps overwriting; final value is the oldest seen
      if (!existing.latestPlayerName && r.player_name) existing.latestPlayerName = r.player_name;
      if (!existing.latestEmail && r.email) existing.latestEmail = r.email;
    }
  }
  const visitors = [...groups.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  );

  const totalVisits = rows.length;
  const uniqueVisitors = visitors.length;
  const last24h = rows.filter((r) => Date.now() - new Date(r.visited_at).getTime() < 24 * 3600 * 1000).length;

  return (
    <main className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6 w-fit"
      >
        <ChevronLeft size={18} />
        <span>Back to Dashboard</span>
      </Link>

      <div className="max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-cyan-400/10 rounded-xl border border-cyan-400/20 shrink-0">
            <Eye className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Site Activity
            </h1>
            <p className="text-white/50 text-base mt-2">
              Last {RECENT_FETCH_LIMIT.toLocaleString()} visits, grouped by visitor.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Stat icon={Eye} label="Visits" value={totalVisits.toLocaleString()} accent="text-cyan-400" />
          <Stat icon={Users} label="Unique Visitors" value={uniqueVisitors.toLocaleString()} accent="text-[#39FF14]" />
          <Stat icon={Clock} label="Last 24h" value={last24h.toLocaleString()} accent="text-yellow-400" />
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-white/10 bg-black/40 text-xs font-bold text-white/40 uppercase tracking-wider">
            <div className="col-span-5 md:col-span-4">Visitor</div>
            <div className="hidden md:block col-span-3">Last Page</div>
            <div className="col-span-3 md:col-span-2 text-right">Visits</div>
            <div className="col-span-4 md:col-span-3 text-right">Last Seen</div>
          </div>
          {visitors.length === 0 ? (
            <p className="text-sm text-white/40 px-4 py-8 text-center">No visits recorded yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {visitors.map((v) => (
                <Link
                  key={v.key}
                  href={`/admin/visits?visitor=${encodeURIComponent(v.key)}`}
                  className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors"
                >
                  <div className="col-span-5 md:col-span-4 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{visitorLabel(v)}</p>
                    <p className="text-xs text-white/40 truncate">{visitorSubLabel(v)}</p>
                  </div>
                  <div className="hidden md:block col-span-3 text-xs text-white/60 truncate font-mono">{v.lastPath}</div>
                  <div className="col-span-3 md:col-span-2 text-right text-sm font-bold text-white tabular-nums">
                    {v.visitCount}
                  </div>
                  <div className="col-span-4 md:col-span-3 text-right text-xs text-white/60 tabular-nums">
                    {formatRelative(v.lastSeen)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function VisitorDetail({ focusedKey, visits }: { focusedKey: string; visits: SiteVisitRow[] }) {
  const latest = visits[0];
  const oldest = visits[visits.length - 1];
  const playerName = visits.find((v) => v.player_name)?.player_name ?? null;
  const email = visits.find((v) => v.email)?.email ?? null;
  const isAnon = focusedKey.startsWith("a:");
  const userAgent = visits.find((v) => v.user_agent)?.user_agent ?? null;

  return (
    <main className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <Link
        href="/admin/visits"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6 w-fit"
      >
        <ChevronLeft size={18} />
        <span>All Visitors</span>
      </Link>

      <div className="max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-cyan-400/10 rounded-xl border border-cyan-400/20 shrink-0">
            <Eye className="text-cyan-400" size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none truncate">
              {playerName ?? email ?? `Anonymous · ${focusedKey.slice(-6)}`}
            </h1>
            <p className="text-white/50 text-base mt-2">
              {isAnon ? "Anonymous visitor" : "Signed-in user"}
              {email && playerName ? ` · ${email}` : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Stat icon={Eye} label="Visits" value={visits.length.toLocaleString()} accent="text-cyan-400" />
          <Stat icon={Clock} label="First Seen" value={formatRelative(oldest.visited_at)} accent="text-yellow-400" />
          <Stat icon={Clock} label="Last Seen" value={formatRelative(latest.visited_at)} accent="text-[#39FF14]" />
        </div>

        {userAgent && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-xs text-white/60 font-mono break-all">
            {userAgent}
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-white/10 bg-black/40 text-xs font-bold text-white/40 uppercase tracking-wider">
            <div className="col-span-7 md:col-span-6">Path</div>
            <div className="hidden md:block col-span-3">Referer</div>
            <div className="col-span-5 md:col-span-3 text-right">When</div>
          </div>
          <div className="divide-y divide-white/5">
            {visits.map((v) => (
              <div key={v.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
                <div className="col-span-7 md:col-span-6 min-w-0 flex items-center gap-2">
                  <LinkIcon size={11} className="text-cyan-400/60 shrink-0" />
                  <Link href={v.path} className="text-xs text-white/80 hover:text-[#39FF14] transition-colors truncate font-mono">
                    {v.path}
                  </Link>
                </div>
                <div className="hidden md:flex col-span-3 items-center gap-1 min-w-0">
                  {v.referer ? (
                    <>
                      <ExternalLink size={11} className="text-white/30 shrink-0" />
                      <span className="text-xs text-white/40 truncate font-mono">{shortenReferer(v.referer)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-white/30">—</span>
                  )}
                </div>
                <div className="col-span-5 md:col-span-3 text-right text-xs text-white/60 tabular-nums">
                  {formatAbsolute(v.visited_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Stat({ icon: Icon, label, value, accent }: { icon: typeof Eye; label: string; value: string; accent: string }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
        <Icon className={accent} size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-widest uppercase text-white/40 truncate">{label}</p>
        <p className="text-base md:text-lg font-black text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function visitorLabel(v: { latestPlayerName: string | null; latestEmail: string | null; key: string }): string {
  if (v.latestPlayerName) return v.latestPlayerName;
  if (v.latestEmail) return v.latestEmail;
  return `Anonymous · ${v.key.slice(-6)}`;
}

function visitorSubLabel(v: { latestPlayerName: string | null; latestEmail: string | null; key: string }): string {
  if (v.latestPlayerName && v.latestEmail) return v.latestEmail;
  if (v.key.startsWith("a:")) return "Anonymous";
  return v.key;
}

function shortenReferer(referer: string): string {
  try {
    const u = new URL(referer);
    return u.host + u.pathname;
  } catch {
    return referer;
  }
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
