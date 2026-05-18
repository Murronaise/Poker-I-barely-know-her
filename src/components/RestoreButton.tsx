"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { restoreGame } from "@/lib/soft-delete-db";
import { undeleteGame } from "@/lib/local-store";
import { toast } from "sonner";

export default function RestoreButton({ gameId }: { gameId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      await restoreGame(gameId);
      // Also clear the local fallback so it doesn't immediately
      // re-shadow the now-restored game on next render.
      undeleteGame(gameId);
      toast.success("Game restored.");
      router.refresh();
    } catch (err) {
      console.error("[restore] failed", err);
      toast.error("Couldn't restore — see console.");
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#39FF14]/15 hover:bg-[#39FF14]/25 border border-[#39FF14]/40 text-[#39FF14] font-black uppercase text-xs tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
      {pending ? "Restoring" : "Restore"}
    </button>
  );
}
