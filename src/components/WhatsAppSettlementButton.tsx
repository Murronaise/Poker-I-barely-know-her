"use client";

import { useState } from "react";
import { Send, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { type HistoricalGame } from "@/lib/historical-games";
import { ADMIN_PLAYER, FOOD_PAYER } from "@/lib/local-store";
import { formatCurrency } from "@/lib/format";

type Props = {
  game: HistoricalGame;
};

export default function WhatsAppSettlementButton({ game }: Props) {
  const [copied, setCopied] = useState(false);

  const getWhatsAppMessage = () => {
    const adminLower = ADMIN_PLAYER.toLowerCase();
    const foodPayerLower = FOOD_PAYER.toLowerCase();

    const playerData = game.players.map((p) => {
      const key = p.name.toLowerCase();
      const pokerNet = p.cashOut - p.buyIn;
      const foodOwed = key === foodPayerLower ? 0 : p.food;
      const combined = pokerNet - foodOwed;
      return { p, pokerNet, combined, foodOwed };
    });

    const winners: string[] = [];
    const losers: string[] = [];

    // Order winners: highest pokerNet first
    const sortedWinners = [...playerData]
      .filter((d) => d.pokerNet > 0.005)
      .sort((a, b) => b.pokerNet - a.pokerNet);

    sortedWinners.forEach(({ p, pokerNet, combined }) => {
      const formattedPoker = formatCurrency(Math.abs(pokerNet));
      const formattedCombined = formatCurrency(Math.abs(combined));
      if (combined > 0.005) {
        winners.push(`🎉 *${p.name}*: receives *${formattedCombined}*`);
      } else {
        winners.push(`🎉 *${p.name}*: won *${formattedPoker}*`);
      }
    });

    // Order losers: highest amount owed first (most negative combined first)
    const sortedLosers = [...playerData]
      .filter((d) => d.combined < -0.005)
      .sort((a, b) => a.combined - b.combined);

    sortedLosers.forEach(({ p, pokerNet, combined, foodOwed }) => {
      const formattedPoker = formatCurrency(Math.abs(pokerNet));
      const formattedFood = formatCurrency(foodOwed);
      const formattedCombined = formatCurrency(Math.abs(combined));
      if (pokerNet > 0.005) {
        losers.push(`💸 *${p.name}*: owes *${formattedCombined}* (won ${formattedPoker} at poker, but owes ${formattedFood} food)`);
      } else {
        const lostLabel = pokerNet < -0.005 ? `lost ${formattedPoker}` : "poker even";
        const foodLabel = foodOwed > 0.005 ? ` + ${formattedFood} food` : "";
        losers.push(`💸 *${p.name}*: owes *${formattedCombined}* (${lostLabel}${foodLabel})`);
      }
    });

    return `🃏 *Poker Settlement - ${game.date}* 🃏

*Congrats to the winners:*
${winners.length > 0 ? winners.join("\n") : "None"}

*Outstanding balances (please settle up):*
${losers.length > 0 ? losers.join("\n") : "All square!"}`;
  };

  const handleCopy = async () => {
    const msg = getWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      toast.success("WhatsApp settlement message copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed", err);
      toast.error("Failed to copy message to clipboard");
    }
  };

  const handleShare = () => {
    const msg = getWhatsAppMessage();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-cyan-400/10 border border-white/10 hover:border-cyan-400/40 text-white/70 hover:text-cyan-400 font-bold text-xs uppercase transition-all"
        title="Copy message to clipboard"
      >
        {copied ? <Check size={13} className="text-[#39FF14]" /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy WA Msg"}
      </button>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-[#25D366]/10 border border-white/10 hover:border-[#25D366]/40 text-white/70 hover:text-[#25D366] font-bold text-xs uppercase transition-all"
        title="Share directly to WhatsApp"
      >
        <Send size={13} />
        Send to WA
      </button>
    </div>
  );
}
