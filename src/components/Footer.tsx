import { Spade } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40 backdrop-blur-xl px-6 xl:px-12 py-2 text-sm text-white/40 shrink-0">
      <div className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Spade size={11} className="text-[#39FF14] shrink-0" />
          <span className="font-bold tracking-widest uppercase text-white/60">
            Poker Tracker
          </span>
          <span className="hidden md:inline text-white/30 truncate">
            — for the games you barely remember.
          </span>
        </div>
        <span className="hidden md:inline text-white/25 font-mono tracking-widest uppercase">
          press <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40">?</kbd> in-game for shortcuts
        </span>
      </div>
    </footer>
  );
}
