"use client";

import { use, useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  TrendingUp,
  Target,
  Clock,
  Camera,
  Calendar,
  CircleDollarSign,
  Pizza,
  ArrowRightSquare,
  ChevronRight,
  X,
  Crop,
  Swords,
  Settings,
  Eye,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import PlayerAvatar from "@/components/PlayerAvatar";
import AvatarPositioner from "@/components/AvatarPositioner";
import CollapsibleSection from "@/components/CollapsibleSection";
import { supabase } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { historicalGames } from "@/lib/historical-games";
import { useIsMounted } from "@/lib/use-hydration";
import { getStoredPlayers } from "@/lib/local-store";
import { isAdmin } from "@/lib/auth";
import { BadgeCheck } from "lucide-react";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ player: string }>;
}) {
  const resolvedParams = use(params);
  const playerName = resolvedParams.player
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Seed from localStorage so a player added locally (when Supabase wasn't
  // available) still shows their saved avatar before the network call resolves.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = getStoredPlayers().find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase(),
    );
    return stored?.avatarUrl ?? null;
  });
  const [isUploading, setIsUploading] = useState(false);
  const isMounted = useIsMounted();
  const [showPositioner, setShowPositioner] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [posBump, setPosBump] = useState(0); // forces PlayerAvatar to re-read stored position
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verified = a registered user owns this player_name. "(You)" = it's the
  // logged-in viewer's own profile. `canEdit` gates the avatar upload + frame
  // controls so randoms can't overwrite someone else's picture (only the
  // owner of the linked account or an admin should be able to change it).
  // `iAmAdmin` separately gates admin-only entry points (e.g. Site Activity).
  const [isVerified, setIsVerified] = useState(false);
  const [isMine, setIsMine] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [iAmAdmin, setIAmAdmin] = useState(false);

  // Fetch existing avatar on mount
  useEffect(() => {
    async function fetchAvatar() {
      try {
        const { data } = await supabase
          .from("players")
          .select("avatar_url")
          .ilike("name", playerName)
          .single();

        if (data && data.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
      } catch {
        // ignore
      }
    }
    fetchAvatar();
  }, [playerName]);

  // Check if any registered user owns this player_name (case-insensitive),
  // whether the viewer themselves owns it, and whether the viewer is admin
  // (admins keep edit rights for moderation). Uses the SSR-aware browser
  // client for auth.getUser() so the cookie-stored session is visible — the
  // plain `supabase` client reads sessions from localStorage and would
  // return a null user, leaving canEdit stuck at false.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const sb = createSupabaseBrowserClient();
      const [{ data: matches }, { data: meResp }] = await Promise.all([
        supabase.from("users").select("email, player_name").ilike("player_name", playerName),
        sb.auth.getUser(),
      ]);
      if (cancelled) return;
      const ownerEmail = matches?.[0]?.email ?? null;
      const myEmail = meResp.user?.email ?? null;
      const mine = Boolean(ownerEmail && myEmail && ownerEmail.toLowerCase() === myEmail.toLowerCase());
      setIsVerified(Boolean(ownerEmail));
      setIsMine(mine);

      // Admin check: email allow-list first (sync), then DB lookup for
      // anyone promoted via the `users.is_admin` flag.
      let admin = isAdmin(myEmail);
      if (!admin && myEmail) {
        const { data: profile } = await supabase
          .from("users")
          .select("is_admin")
          .eq("email", myEmail)
          .maybeSingle();
        admin = profile?.is_admin === true;
      }
      if (cancelled) return;
      setCanEdit(mine || admin);
      setIAmAdmin(admin);
    };
    check();
    return () => { cancelled = true; };
  }, [playerName]);

  const handleAvatarClick = () => {
    // Only the owning account (or an admin) can change the picture. We've
    // already hidden the edit affordances when canEdit is false, but this
    // belt-and-braces guard stops the menu from opening if the click reaches
    // the avatar through some other path (keyboard focus, etc.).
    if (!canEdit) return;
    // Always toggle the menu so users can choose between Replace and Adjust.
    // (Previously, with no avatar set we jumped straight to the file picker,
    // which hid the menu entirely once supabase fell back to a placeholder.)
    setShowAvatarMenu((m) => !m);
  };

  // Close avatar menu when clicking outside
  useEffect(() => {
    if (!showAvatarMenu) return;
    const close = () => setShowAvatarMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showAvatarMenu]);

  // Close positioner on Escape
  useEffect(() => {
    if (!showPositioner) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPositioner(false);
        setPosBump((b) => b + 1);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showPositioner]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl);
    setShowPositioner(true); // open positioner immediately so user can frame the new image

    try {
      setIsUploading(true);

      // Use the SSR-aware client so the upload + upsert carry the user's
      // auth cookie. Storage RLS and the players-table policy reject
      // unauthenticated writes, which is what was happening with the plain
      // module client.
      const sb = createSupabaseBrowserClient();
      const fileExt = file.name.split(".").pop();
      const fileName = `${playerName.replace(/ /g, "-").toLowerCase()}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await sb.storage
        .from("avatars")
        .upload(fileName, file);

      if (uploadError) {
        console.error("Error uploading avatar:", uploadError);
        return;
      }

      const { data } = sb.storage.from("avatars").getPublicUrl(fileName);
      setAvatarUrl(data.publicUrl);
      const { error: upsertError } = await sb
        .from("players")
        .upsert({ name: playerName, avatar_url: data.publicUrl }, { onConflict: "name" });
      if (upsertError) console.error("Error saving avatar URL:", upsertError);
    } catch (error) {
      console.error("Error uploading avatar:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // Filter sessions where this player participated and link them to history.
  // `net` here is the *poker* net (cash-out minus buy-in). Food is settled
  // separately via the food-payer (Toby) and never folded into "net".
  const playerSessions = historicalGames
    .filter((g) => g.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase()))
    .map((g) => {
      const me = g.players.find((p) => p.name.toLowerCase() === playerName.toLowerCase())!;
      return {
        id: g.id,
        date: g.date,
        buyIn: me.buyIn,
        cashOut: me.cashOut,
        food: me.food,
        net: me.cashOut - me.buyIn,
      };
    });

  const biggestWin = playerSessions.length > 0 ? Math.max(...playerSessions.map((s) => s.net)) : 0;
  const biggestLoss = playerSessions.length > 0 ? Math.min(...playerSessions.map((s) => s.net)) : 0;
  const totalFoodSpend = playerSessions.reduce((sum, s) => sum + s.food, 0);

  // Derived headline stats
  const totalNet = playerSessions.reduce((sum, s) => sum + s.net, 0);
  const winsCount = playerSessions.filter((s) => s.net >= 0).length;
  const winRatePct = playerSessions.length > 0 ? Math.round((winsCount / playerSessions.length) * 100) : 0;
  const avgBuyIn = playerSessions.length > 0 ? playerSessions.reduce((sum, s) => sum + s.buyIn, 0) / playerSessions.length : 0;
  const formatNet = (n: number) =>
    `${n >= 0 ? "+" : "-"}£${Math.abs(n).toFixed(2)}`;

  // Performance chart — running cumulative net across sessions in chronological
  // order (playerSessions is most-recent-first, so reverse for the line).
  const performanceData = [...playerSessions].reverse().reduce<{ date: string; profit: number }[]>(
    (acc, s) => {
      const last = acc.length > 0 ? acc[acc.length - 1].profit : 0;
      acc.push({ date: s.date, profit: Number((last + s.net).toFixed(2)) });
      return acc;
    },
    [],
  );

  // Where y=0 sits inside the chart, expressed as a 0..1 offset top-down. Used
  // to split the area + line gradients so segments above zero render green and
  // segments below zero render red. For all-positive data the offset is 1
  // (entire gradient is green); all-negative is 0 (entire gradient is red).
  const profits = performanceData.length > 0 ? performanceData.map((d) => d.profit) : [0];
  const dataMax = Math.max(...profits);
  const dataMin = Math.min(...profits);
  const fillTop = Math.max(dataMax, 0);
  const fillBottom = Math.min(dataMin, 0);
  const fillRange = fillTop - fillBottom;
  const fillZeroOffset = fillRange > 0 ? fillTop / fillRange : 1;
  const strokeRange = dataMax - dataMin;
  const strokeZeroOffset =
    strokeRange > 0
      ? Math.max(0, Math.min(1, dataMax / strokeRange))
      : dataMax >= 0
        ? 1
        : 0;

  let streakCount = 0;
  let streakWin = true;
  for (const s of playerSessions) {
    if (streakCount === 0) {
      streakWin = s.net >= 0;
      streakCount = 1;
    } else if ((streakWin && s.net >= 0) || (!streakWin && s.net < 0)) {
      streakCount++;
    } else {
      break;
    }
  }

  // H2H comparison must use the *same* net definition on both sides — the
  // player's `session.net` is `cashOut - buyIn` (food is settled separately
  // by the food-payer), so the opponent's net needs to drop the food term too.
  // Otherwise an opponent who paid for food looks worse than they really were
  // and the W/L tally is biased.
  const h2h: Record<string, { wins: number; losses: number; draws: number; netVs: number }> = {};
  playerSessions.forEach((session) => {
    const fullGame = historicalGames.find((g) => g.id === session.id);
    if (!fullGame) return;
    fullGame.players
      .filter((p) => p.name.toLowerCase() !== playerName.toLowerCase())
      .forEach((opp) => {
        const oppNet = opp.cashOut - opp.buyIn;
        if (!h2h[opp.name]) h2h[opp.name] = { wins: 0, losses: 0, draws: 0, netVs: 0 };
        if (session.net > oppNet) h2h[opp.name].wins++;
        else if (session.net < oppNet) h2h[opp.name].losses++;
        else h2h[opp.name].draws++;
        h2h[opp.name].netVs += session.net - oppNet;
      });
  });
  const h2hEntries = Object.entries(h2h)
    .sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses))
    .slice(0, 5);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        <Link
          href="/players"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors"
        >
          <ChevronLeft size={18} />
          <span>Back to Roster</span>
        </Link>

        {/* Profile Header */}
        <div className="flex flex-col md:flex-row gap-5 md:items-center">
          <div
            className={`relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/60 rounded-full shrink-0 mx-auto md:mx-0 ${
              canEdit ? "cursor-pointer" : ""
            }`}
            role={canEdit ? "button" : undefined}
            tabIndex={canEdit ? 0 : -1}
            aria-haspopup={canEdit ? "menu" : undefined}
            aria-expanded={canEdit ? showAvatarMenu : undefined}
            aria-label={canEdit ? (avatarUrl ? "Change or reframe profile picture" : "Upload profile picture") : `${playerName}'s profile picture`}
            onClick={canEdit ? handleAvatarClick : undefined}
            onKeyDown={(e) => {
              if (!canEdit) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleAvatarClick();
              }
            }}
          >
            {canEdit && (
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            )}
            <div
              className={`w-28 h-28 md:w-32 md:h-32 rounded-full border-4 shadow-[0_0_30px_rgba(57,255,20,0.2)] overflow-hidden transition-all duration-300 ${
                isUploading
                  ? "border-white/50 animate-pulse"
                  : canEdit
                    ? "border-white/10 group-hover:border-[#39FF14]"
                    : "border-white/10"
              }`}
            >
              <PlayerAvatar
                key={posBump}
                name={playerName}
                avatarUrl={avatarUrl}
                size={128}
                className="w-full h-full"
              />
            </div>
            {canEdit && (
              <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white mb-1" size={20} />
                <span className="text-xs font-bold tracking-widest uppercase text-white">
                  {avatarUrl ? "Edit" : "Upload"}
                </span>
              </div>
            )}
            {/* Options menu — drops BELOW the avatar so it never lands above
                the top of the viewport. */}
            {canEdit && showAvatarMenu && (
              <div
                className="absolute top-full left-0 mt-3 bg-[#0E1117] border border-white/15 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.6)] z-30 overflow-hidden min-w-[200px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => { setShowAvatarMenu(false); fileInputRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-base font-semibold text-white/80 hover:text-white hover:bg-white/5 transition-colors text-left"
                >
                  <Camera size={15} className="text-[#39FF14]" />
                  {avatarUrl ? "Replace Image" : "Upload Image"}
                </button>
                <div className="border-t border-white/5" />
                <button
                  type="button"
                  disabled={!avatarUrl}
                  onClick={() => { setShowAvatarMenu(false); setShowPositioner(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-base font-semibold text-white/80 hover:text-white hover:bg-white/5 transition-colors text-left disabled:text-white/25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Crop size={15} className="text-cyan-400" /> Adjust Frame
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-none">
                {playerName}
              </h1>
              {isVerified && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded px-1.5 py-0.5"
                  title="Linked to a registered account"
                >
                  <BadgeCheck size={10} />
                  Verified
                </span>
              )}
              {isMine && (
                <span className="inline-flex items-center text-[10px] font-black tracking-widest uppercase text-cyan-400 bg-cyan-400/10 border border-cyan-400/30 rounded px-1.5 py-0.5">
                  You
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-white/50 text-base mt-2 font-semibold">
              <Calendar size={13} className="text-[#39FF14]/70" />
              <span>{playerSessions.length} sessions tracked</span>
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleAvatarClick(); }}
                  className="inline-flex items-center gap-2 min-h-11 text-xs font-bold tracking-widest uppercase px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#39FF14]/40 text-white/70 hover:text-[#39FF14] transition-colors"
                >
                  <Camera size={14} aria-hidden="true" /> {avatarUrl ? "Change Picture" : "Upload Picture"}
                </button>
                {isMine && (
                  <Link
                    href="/account"
                    className="inline-flex items-center gap-2 min-h-11 text-xs font-bold tracking-widest uppercase px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/40 text-white/70 hover:text-cyan-400 transition-colors"
                  >
                    <Settings size={14} aria-hidden="true" /> Account Settings
                  </Link>
                )}
                {isMine && iAmAdmin && (
                  <Link
                    href="/admin/visits"
                    className="inline-flex items-center gap-2 min-h-11 text-xs font-bold tracking-widest uppercase px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/40 text-white/70 hover:text-cyan-400 transition-colors"
                    title="Admin only — see who's visited the site"
                  >
                    <Eye size={14} aria-hidden="true" /> Site Activity
                  </Link>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: TrendingUp, label: "Profit", value: formatNet(totalNet), color: totalNet >= 0 ? "text-[#39FF14]" : "text-red-400" },
            { icon: Target, label: "Win Rate", value: `${winRatePct}%`, color: "text-cyan-400" },
            { icon: Clock, label: "Sessions", value: String(playerSessions.length), color: "text-yellow-400" },
            { icon: CircleDollarSign, label: "Avg Buy-In", value: `£${avgBuyIn.toFixed(2)}`, color: "text-emerald-400" },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3 hover:border-white/20 transition-colors"
            >
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 shrink-0">
                <m.icon className={m.color} size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                  {m.label}
                </p>
                <p className="text-2xl md:text-2xl font-black text-white truncate">{m.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Extended stats — biggest win/loss, streak, food */}
        {playerSessions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Best Session", value: `+£${biggestWin.toFixed(2)}`, color: "text-[#39FF14]", show: biggestWin > 0 },
              { label: "Worst Session", value: `-£${Math.abs(biggestLoss).toFixed(2)}`, color: "text-red-400", show: biggestLoss < 0 },
              { label: streakWin ? "Win Streak" : "Loss Streak", value: `${streakCount}`, sub: streakWin ? "in a row" : "in a row", color: streakWin ? "text-[#39FF14]" : "text-red-400", show: streakCount > 0 },
              { label: "Food Spend", value: `£${totalFoodSpend.toFixed(2)}`, color: "text-yellow-400", show: totalFoodSpend > 0 },
            ].filter((s) => s.show).map((s) => (
              <div key={s.label} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex flex-col gap-0.5">
                <p className="text-xs font-bold tracking-widest uppercase text-white/40">{s.label}</p>
                <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                {s.sub && <p className="text-xs text-white/30">{s.sub}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Lifetime Performance Chart — collapsible. Stroke + fill flip red
            when the player's cumulative net is below £0 so the colour matches
            the financial reality (green-on-loss was misleading). */}
        <CollapsibleSection
          title="Lifetime Performance"
          collapseUnderHeight={900}
          icon={
            <TrendingUp
              className={totalNet < 0 ? "text-red-400" : "text-[#39FF14]"}
              size={18}
            />
          }
        >
          <div className="h-[260px]">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={performanceData}
                  margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
                >
                  <defs>
                    {/* Fill gradient: green above the zero crossing, red
                        below. Each side fades to transparent toward the zero
                        line so the band closest to £0 stays subtle. */}
                    <linearGradient id="splitProfitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={0} stopColor="#39FF14" stopOpacity={0.4} />
                      <stop offset={fillZeroOffset} stopColor="#39FF14" stopOpacity={0} />
                      <stop offset={fillZeroOffset} stopColor="#ef4444" stopOpacity={0} />
                      <stop offset={1} stopColor="#ef4444" stopOpacity={0.4} />
                    </linearGradient>
                    {/* Stroke gradient: hard switch from green to red exactly
                        at the zero crossing so the line itself shows the sign. */}
                    <linearGradient id="splitProfitStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={0} stopColor="#39FF14" />
                      <stop offset={strokeZeroOffset} stopColor="#39FF14" />
                      <stop offset={strokeZeroOffset} stopColor="#ef4444" />
                      <stop offset={1} stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#ffffff40"
                    tick={{ fill: "#ffffff80", fontSize: 14 }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    // Show only the first and last session date so the axis
                    // stays clean regardless of how many sessions a player has
                    // (matches Jake's 2-session look for everyone).
                    ticks={
                      performanceData.length > 1
                        ? [
                            performanceData[0].date,
                            performanceData[performanceData.length - 1].date,
                          ]
                        : undefined
                    }
                    interval={0}
                  />
                  <YAxis
                    stroke="#ffffff40"
                    tick={{ fill: "#ffffff80", fontSize: 14 }}
                    tickFormatter={(val) =>
                      val < 0 ? `−£${Math.abs(val)}` : `£${val}`
                    }
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                    // Pad the domain by ~10% of the range so the line never
                    // hugs the chart edges; for all-negative data this also
                    // pulls £0 down off the very top so the line breathes.
                    domain={[
                      (dataMin: number) =>
                        Math.floor(Math.min(dataMin, 0) - Math.max(Math.abs(dataMin) * 0.1, 5)),
                      (dataMax: number) =>
                        Math.ceil(Math.max(dataMax, 0) + Math.max(Math.abs(dataMax) * 0.1, 5)),
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(14,17,23,0.95)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "12px",
                      backdropFilter: "blur(8px)",
                      color: "#FAFAFA",
                    }}
                    labelStyle={{ color: "#FAFAFA", fontWeight: 700 }}
                    formatter={(value) => {
                      const n = Number(value);
                      const sign = n < 0 ? "−" : "+";
                      const label = n < 0 ? "Cumulative Loss" : "Cumulative Profit";
                      return [
                        <span
                          key="v"
                          style={{ color: n < 0 ? "#fca5a5" : "#39FF14", fontWeight: 700 }}
                        >
                          {sign}£{Math.abs(n).toFixed(2)}
                        </span>,
                        label,
                      ];
                    }}
                  />
                  {/* Anchor zero so the eye can read profit vs loss at a glance. */}
                  <ReferenceLine
                    y={0}
                    stroke="rgba(255,255,255,0.25)"
                    strokeDasharray="2 4"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="url(#splitProfitStroke)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#splitProfitFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20 font-bold">
                LOADING...
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Recent Sessions — collapsible, links to history */}
        <CollapsibleSection
          title="Recent Sessions"
          icon={<Calendar className="text-[#39FF14]" size={18} />}
          rightSlot={
            <Link
              href="/games"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-bold tracking-widest uppercase text-white/50 hover:text-[#39FF14] transition-colors"
            >
              View All →
            </Link>
          }
          collapseUnderHeight={900}
        >
          {playerSessions.length === 0 ? (
            <div className="py-8 text-center text-white/30 text-xs font-bold tracking-widest uppercase">
              No tracked sessions yet
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              <div className="hidden md:grid grid-cols-12 gap-3 px-2 py-2 text-xs font-bold uppercase tracking-widest text-white/30">
                <div className="col-span-3">Date</div>
                <div className="col-span-2 text-right">Buy-in</div>
                <div className="col-span-2 text-right">Cash Out</div>
                <div className="col-span-2 text-right">Food</div>
                <div className="col-span-3 text-right">Profit</div>
              </div>
              {playerSessions.map((s) => {
                const positive = s.net >= 0;
                return (
                  <Link
                    key={s.id}
                    href={`/games/history/${s.id}`}
                    className="grid grid-cols-2 md:grid-cols-12 gap-3 px-2 py-3 items-center hover:bg-white/5 transition-colors group rounded-lg"
                  >
                    <div className="md:col-span-3 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shrink-0">
                        <Calendar size={12} />
                      </div>
                      <span className="font-bold text-base text-white/90 truncate">{s.date}</span>
                    </div>
                    <div className="md:col-span-2 flex md:block items-center gap-2 md:text-right">
                      <CircleDollarSign size={11} className="md:hidden text-[#39FF14]/60" />
                      <span className="text-base font-bold text-white/70">£{s.buyIn.toFixed(2)}</span>
                    </div>
                    <div className="md:col-span-2 flex md:block items-center gap-2 md:text-right">
                      <ArrowRightSquare size={11} className="md:hidden text-red-400/60" />
                      <span className="text-base font-bold text-white/70">£{s.cashOut.toFixed(2)}</span>
                    </div>
                    <div className="md:col-span-2 flex md:block items-center gap-2 md:text-right">
                      <Pizza size={11} className="md:hidden text-yellow-400/60" />
                      <span className="text-base font-bold text-white/70">£{s.food.toFixed(2)}</span>
                    </div>
                    <div className="col-span-2 md:col-span-3 text-right flex items-center justify-end gap-1">
                      <span
                        className={`text-lg font-black ${
                          positive ? "text-[#39FF14]" : "text-red-400"
                        }`}
                      >
                        {positive ? "+" : ""}£{s.net.toFixed(2)}
                      </span>
                      <ChevronRight
                        size={14}
                        className="text-white/20 group-hover:text-[#39FF14] transition-colors"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CollapsibleSection>
        {/* Head-to-Head */}
        {h2hEntries.length > 0 && (
          <CollapsibleSection
            title="Head-to-Head"
            icon={<Swords className="text-[#39FF14]" size={18} />}
            collapseUnderHeight={900}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {h2hEntries.map(([opponent, record]) => {
                const total = record.wins + record.losses + record.draws;
                const winPct = total > 0 ? Math.round((record.wins / total) * 100) : 0;
                const isAhead = record.wins > record.losses;
                return (
                  <Link
                    key={opponent}
                    href={`/profile/${encodeURIComponent(opponent.toLowerCase().replace(/ /g, "-"))}`}
                    className="flex items-center gap-3 bg-black/20 hover:bg-white/5 border border-white/5 hover:border-[#39FF14]/20 rounded-xl p-3 transition-all group"
                  >
                    <PlayerAvatar name={opponent} size={52} className="rounded-full border border-white/10 group-hover:border-[#39FF14]/40 transition-colors shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-white/90 truncate">{opponent}</p>
                      <p className="text-sm text-white/40">
                        <span className="text-[#39FF14] font-bold">{record.wins}W</span>
                        {" · "}
                        <span className="text-red-400 font-bold">{record.losses}L</span>
                        {record.draws > 0 && <span className="text-white/30 font-bold"> · {record.draws}D</span>}
                      </p>
                      <p className={`text-xs font-bold tabular-nums mt-1 ${record.netVs >= 0 ? "text-[#39FF14]/80" : "text-red-400/80"}`}>
                        you're {record.netVs >= 0 ? "+" : ""}£{record.netVs.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black tabular-nums ${isAhead ? "text-[#39FF14]" : "text-red-400"}`}>{winPct}%</p>
                      <p className="text-xs text-white/30 uppercase tracking-widest font-bold">win rate</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Avatar Positioner Modal — sizing is responsive so the positioner
          circle never overflows on phones (was hard-coded 220px inside a
          24px-padded modal => clipped on 375px). */}
      {showPositioner && avatarUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Frame profile picture"
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => {
            setShowPositioner(false);
            setPosBump((b) => b + 1);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0E1117] border border-white/10 rounded-3xl p-4 sm:p-6 w-full max-w-[min(92vw,22rem)] relative"
          >
            <button
              onClick={() => {
                setShowPositioner(false);
                setPosBump((b) => b + 1);
              }}
              className="absolute top-2 right-2 inline-flex items-center justify-center w-11 h-11 text-white/50 hover:text-white"
              aria-label="Close frame picture dialog"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black tracking-tight uppercase mb-1 pr-10">
              Frame Picture
            </h3>
            <p className="text-sm text-white/50 mb-5">
              Drag to pan · scroll or slide to zoom · saves automatically.
            </p>
            <div className="flex justify-center">
              {/* Cap at min(viewport-padding, design max). On a 360px phone
                  this lands around 240px; on desktop it stays at 220px. */}
              <AvatarPositioner
                name={playerName}
                avatarUrl={avatarUrl}
                size={Math.min(220, typeof window !== "undefined" ? window.innerWidth - 96 : 220)}
              />
            </div>
          </div>
        </div>
      )}
    </motion.main>
  );
}
