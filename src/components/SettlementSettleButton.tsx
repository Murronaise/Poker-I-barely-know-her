"use client";

import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { togglePlayerSettledDb } from "@/lib/settlements-db";
import { useIsMounted } from "@/lib/use-hydration";
import { emitSettlementToggled, onSettlementToggled } from "@/lib/settlement-events";

type Props = {
  gameId: string;
  playerName: string;
  /** When false the button is read-only — non-admins still see the badge. */
  isAdmin: boolean;
  /** Server-rendered initial state from Supabase. */
  initialSettled: boolean;
};

export default function SettlementSettleButton({ gameId, playerName, isAdmin, initialSettled }: Props) {
  const isMounted = useIsMounted();
  const [settled, setSettled] = useState(initialSettled);
  const [pending, setPending] = useState(false);

  // Re-sync from sibling toggles on the same page (e.g. admin "Reset" button
  // wipes every tick — it broadcasts with an empty playerName).
  useEffect(() => {
    return onSettlementToggled((detail) => {
      if (detail.gameId !== gameId) return;
      if (detail.playerName === "") {
        // Game-wide reset.
        setSettled(false);
        return;
      }
      if (detail.playerName.toLowerCase() === playerName.toLowerCase()) {
        setSettled(detail.settled);
      }
    });
  }, [gameId, playerName]);

  // Read-only badge for non-admins — they should still see who's paid.
  if (!isAdmin) {
    return settled ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 shrink-0">
        <Check size={10} />
        Paid
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase text-white/40 bg-white/5 border border-white/10 shrink-0">
        Owing
      </span>
    );
  }

  if (!isMounted) {
    return <div aria-hidden="true" className="w-[88px] h-7 shrink-0" />;
  }

  const handleClick = async () => {
    if (pending) return;
    const previous = settled;
    const optimistic = !previous;
    setSettled(optimistic);
    setPending(true);
    try {
      const next = await togglePlayerSettledDb(gameId, playerName, previous);
      setSettled(next);
      emitSettlementToggled({ gameId, playerName, settled: next });
    } catch (err) {
      // Revert on failure (most likely RLS rejection or network blip).
      setSettled(previous);
      console.error("[settlement] toggle failed", err);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-pressed={settled}
      aria-label={settled ? `Mark ${playerName} as not settled` : `Mark ${playerName} as settled`}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border transition-colors shrink-0 disabled:opacity-60 ${
        settled
          ? "text-[#39FF14] bg-[#39FF14]/15 border-[#39FF14]/40 hover:bg-[#39FF14]/25"
          : "text-white/60 bg-white/5 border-white/15 hover:bg-white/10 hover:text-white"
      }`}
    >
      {pending ? (
        <Loader2 size={10} className="animate-spin" />
      ) : (
        <Check size={10} className={settled ? "" : "opacity-40"} />
      )}
      {settled ? "Paid" : "Mark Paid"}
    </button>
  );
}
