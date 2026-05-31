"use client";

// Lifetime-profit chip-stack chart. Originally inline in the dashboard;
// extracted so the leaderboards "Overall Leader" landing can reuse the
// same visualization without duplicating the SVG chip-stack physics or
// the Recharts wiring.
//
// Self-contained: derives the per-player net-profit data from
// `historicalGames` at module load (it's hard-coded data — no Supabase
// dependency, safe to compute up front). Pass `players` to use a custom
// dataset (e.g., when the leaderboard switches to a non-overall slice in
// future).

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Coins, TrendingUp } from "lucide-react";
import { useIsMounted } from "@/lib/use-hydration";
import { historicalGames, type HistoricalGame } from "@/lib/historical-games";

export type ChipChartPlayer = {
  name: string;
  /** Signed net profit. Negative pushes the chip stack into the red. */
  profit: number;
};

// =========================================================================
// Chip-stack SVG shape — drop-in custom shape for Recharts <Bar>.
// =========================================================================

type ChipStackProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { name: string; profit: number };
};

const ChipStackShape = (props: ChipStackProps) => {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || height === 0 || isNaN(height)) return null;

  const isPositive = payload.profit >= 0;
  const chipThickness = 10;
  const numChips = Math.max(1, Math.ceil(Math.abs(height) / chipThickness));

  const cx = x + width / 2;
  const rx = width / 2 - 6;
  const ry = rx * 0.35;
  const baseLine = y + height;
  const baseColor = isPositive ? "#22c55e" : "#ef4444";
  const darkColor = isPositive ? "#14532d" : "#7f1d1d";

  // CSS-driven drop-in (see `chip-drop` keyframes in globals.css). One
  // animation per chip, GPU-composited, suppressed by prefers-reduced-motion.
  const chips = [];
  for (let i = 0; i < numChips; i++) {
    const chipY = baseLine - chipThickness * (i + 1);
    const delay = `${i * 60}ms`;
    chips.push(
      <g
        key={`${payload.name}-${i}`}
        className="chip-drop"
        style={{ animationDelay: delay }}
      >
        <ellipse cx={cx} cy={chipY + chipThickness} rx={rx} ry={ry} fill={darkColor} />
        <rect x={cx - rx} y={chipY} width={rx * 2} height={chipThickness} fill={darkColor} />
        <rect x={cx - rx} y={chipY} width={3} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <rect x={cx + rx - 3} y={chipY} width={3} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <rect x={cx - 3} y={chipY} width={6} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <ellipse cx={cx} cy={chipY} rx={rx} ry={ry} fill={baseColor} />
        <ellipse cx={cx} cy={chipY} rx={rx * 0.75} ry={ry * 0.75} fill="transparent" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} />
        <ellipse cx={cx} cy={chipY} rx={rx * 0.4} ry={ry * 0.4} fill={darkColor} opacity={0.3} />
      </g>
    );
  }

  return <g>{chips}</g>;
};

// =========================================================================
// Public component
// =========================================================================

type Props = {
  /** Override the dataset. Defaults to derived lifetime profit per player. */
  players?: ChipChartPlayer[];
};

/**
 * Build the default dataset — net lifetime profit per player, sorted with
 * the biggest winner on the left.
 */
export function buildDefaultDataWith(games: HistoricalGame[]): ChipChartPlayer[] {
  const byName = new Map<string, number>();
  for (const g of games) {
    for (const p of g.players) {
      byName.set(p.name, (byName.get(p.name) ?? 0) + (p.cashOut - p.buyIn));
    }
  }
  return [...byName.entries()]
    .map(([name, net]) => ({ name, profit: Number(net.toFixed(2)) }))
    .sort((a, b) => b.profit - a.profit);
}

function buildDefaultData(): ChipChartPlayer[] {
  return buildDefaultDataWith(historicalGames);
}

export default function LifetimeProfitChart({ players }: Props) {
  const isMounted = useIsMounted();

  // Recharts uses `magnitude` for bar height so positive and negative bars
  // both grow up from £0; `profit` keeps the sign so the chip colours and
  // the tooltip read correctly.
  const chartData = useMemo(() => {
    const source = players ?? buildDefaultData();
    return source.map((p) => ({
      name: p.name,
      profit: p.profit,
      magnitude: Math.abs(p.profit),
    }));
  }, [players]);

  if (!isMounted) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/20 font-bold">
        LOADING...
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white/40">
        <div className="relative mb-4 opacity-30">
          <Coins size={64} className="text-white" />
          <TrendingUp size={24} className="absolute -bottom-2 -right-2 text-[#39FF14]" />
        </div>
        <p className="text-sm font-bold tracking-widest uppercase">No Session Data Yet</p>
        <p className="text-xs text-white/30 mt-2 text-center max-w-[250px]">
          Play your first session to see player profit rankings here.
        </p>
      </div>
    );
  }

  const yMax = Math.ceil(Math.max(...chartData.map((d) => d.magnitude)) * 1.2);

  return (
    <ResponsiveContainer width="100%" height="100%" style={{ overflow: "visible" }}>
      <BarChart data={chartData} style={{ overflow: "visible" }} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
        <XAxis
          dataKey="name"
          stroke="#ffffff40"
          tick={{ fill: "#ffffff80", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          dy={8}
        />
        <YAxis
          stroke="#ffffff40"
          tick={{ fill: "#ffffff80", fontSize: 13 }}
          tickFormatter={(val) => `£${val}`}
          axisLine={false}
          tickLine={false}
          dx={-8}
          domain={[0, yMax]}
        />
        <Tooltip
          cursor={{ fill: "rgba(57,255,20,0.05)" }}
          contentStyle={{
            backgroundColor: "rgba(14,17,23,0.95)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "12px",
            backdropFilter: "blur(8px)",
            color: "#FAFAFA",
          }}
          labelStyle={{ color: "#FAFAFA", fontWeight: 700 }}
          // Show the *real* signed profit; explicit ±/Win/Loss text so the
          // tooltip doesn't lean on colour alone (was green-only,
          // unreadable for protanopia/deuteranopia).
          formatter={(_value, _name, entry) => {
            const n = Number((entry?.payload as { profit?: number } | undefined)?.profit ?? 0);
            const sign = n < 0 ? "−" : "+";
            const label = n < 0 ? "Loss" : "Profit";
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
        <Bar dataKey="magnitude" shape={<ChipStackShape />} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Convenience export — the default dataset used by the dashboard. Exposed
 * so callers don't have to import historicalGames + recompute.
 */
export function getDefaultLifetimeChartData(games?: HistoricalGame[]): ChipChartPlayer[] {
  return games ? buildDefaultDataWith(games) : buildDefaultData();
}
