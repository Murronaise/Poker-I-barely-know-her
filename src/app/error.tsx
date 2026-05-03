"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ChevronLeft } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-10 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.08)_0%,_rgba(14,17,23,1)_60%)] overflow-auto">
      <div className="max-w-lg w-full text-center bg-white/5 backdrop-blur-xl border border-red-500/20 rounded-3xl p-10 shadow-[0_0_50px_rgba(239,68,68,0.15)]">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
          <AlertTriangle size={28} className="text-red-400" />
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest text-white/90 mb-2">
          Hand Misdealt
        </h1>
        <p className="text-white/50 mb-2">Something went wrong rendering this view.</p>
        {error?.message && (
          <p className="text-xs text-red-400/70 font-mono mb-8 break-words">
            {error.message}
          </p>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#39FF14]/10 border border-[#39FF14]/40 text-[#39FF14] font-black tracking-widest uppercase rounded-2xl hover:bg-[#39FF14]/20 transition-all"
          >
            <RefreshCw size={18} />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white/70 hover:text-white font-black tracking-widest uppercase rounded-2xl hover:bg-white/10 transition-all"
          >
            <ChevronLeft size={18} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
