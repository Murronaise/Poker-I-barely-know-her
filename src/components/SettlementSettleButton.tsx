"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { isPlayerSettled, togglePlayerSettled } from "@/lib/local-store";
import { useIsMounted } from "@/lib/use-hydration";
import { emitSettlementToggled, onSettlementToggled } from "@/lib/settlement-events";

type Props = {
  gameId: string;
  playerName: string;
  /** When false the button is read-only — non-admins still see the badge. */
  isAdmin: boolean;
};

export default function SettlementSettleButton({ gameId, playerName, isAdmin }: Props) {
  const isMounted = useIsMounted();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (isMounted) setSettled(isPlayerSettled(gameId, playerName));
  }, [isMounted, gameId, playerName]);

  // Re-read whenever any settlement toggle fires for this game. Most events
  // come from this component's own click, but the admin "Reset" button on
  // HistoryActions broadcasts a clear (empty playerName) that wipes every
  // tick on the page — we have to react to that too.
  useEffect(() => {
    return onSettlementToggled((detail) => {
      if (detail.gameId !== gameId) return;
      // Either a global reset (empty name) or our own player toggling.
      if (detail.playerName === "" || detail.playerName.toLowerCase() === playerName.toLowerCase()) {
        setSettled(isPlayerSettled(gameId, playerName));
      }
    });
  }, [gameId, playerName]);

  if (!isMounted) {
    // Reserve roughly the right space so the layout doesn't jump when the
    // client takes over.
    return <div aria-hidden="true" className="w-[88px] h-7 shrink-0" />;
  }

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

  const handleClick = () => {
    const next = togglePlayerSettled(gameId, playerName);
    setSettled(next);
    emitSettlementToggled({ gameId, playerName, settled: next });
  };

  return (
    <button
      onClick={handleClick}
      aria-pressed={settled}
      aria-label={settled ? `Mark ${playerName} as not settled` : `Mark ${playerName} as settled`}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border transition-colors shrink-0 ${
        settled
          ? "text-[#39FF14] bg-[#39FF14]/15 border-[#39FF14]/40 hover:bg-[#39FF14]/25"
          : "text-white/60 bg-white/5 border-white/15 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Check size={10} className={settled ? "" : "opacity-40"} />
      {settled ? "Paid" : "Mark Paid"}
    </button>
  );
}
