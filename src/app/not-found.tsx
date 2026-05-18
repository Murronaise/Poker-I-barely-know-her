import Link from "next/link";
import { Spade, ChevronLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-10 bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.08)_0%,_rgba(14,17,23,1)_60%)] overflow-auto">
      <div className="max-w-lg w-full text-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/20 mb-6">
          <Spade size={28} className="text-[#39FF14]" />
        </div>

        <h1 className="text-7xl font-black tracking-tighter text-shimmer mb-3" aria-label="Error code 404 — page not found">
          404
        </h1>

        <p className="text-2xl font-black uppercase tracking-widest text-white/90 mb-2">
          Bust Hand
        </p>
        <p className="text-white/50 mb-8">
          That page folded before the river. Return to the table to keep
          playing.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#39FF14]/10 border border-[#39FF14]/40 text-[#39FF14] font-black tracking-widest uppercase rounded-2xl hover:bg-[#39FF14]/20 hover:shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all"
        >
          <ChevronLeft size={18} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
