"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spade, X, Keyboard } from "lucide-react";

const shortcuts: { keys: string[]; label: string }[] = [
  { keys: ["?"], label: "Show keyboard shortcuts" },
  { keys: ["g", "d"], label: "Go to Dashboard" },
  { keys: ["g", "g"], label: "Go to Games" },
  { keys: ["g", "p"], label: "Go to Players" },
  { keys: ["g", "l"], label: "Go to Leaderboards" },
  { keys: ["Esc"], label: "Close menus / dialogs" },
];

export default function Footer() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    let lastG = 0;
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }

      // Two-key chord: g then d/g/p/l
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 800) {
        const dest =
          e.key === "d"
            ? "/"
            : e.key === "g"
              ? "/games"
              : e.key === "p"
                ? "/players"
                : e.key === "l"
                  ? "/leaderboards"
                  : null;
        if (dest) {
          e.preventDefault();
          window.location.assign(dest);
        }
        lastG = 0;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <footer className="border-t border-white/10 bg-black/40 backdrop-blur-xl px-6 xl:px-12 py-2 text-sm text-white/40 shrink-0 safe-pb">
        <div className="w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Spade size={11} className="text-[#39FF14] shrink-0" aria-hidden="true" />
            <span className="font-bold tracking-widest uppercase text-white/60">
              Poker Tracker
            </span>
            <span className="hidden md:inline text-white/30 truncate">
              — for the games you barely remember.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="hidden md:inline-flex items-center gap-2 text-white/25 hover:text-[#39FF14] font-mono tracking-widest uppercase transition-colors"
            aria-label="Show keyboard shortcuts"
          >
            press
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60">?</kbd>
            for shortcuts
          </button>
        </div>
      </footer>

      {showHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0E1117] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(57,255,20,0.15)] p-6 max-w-md w-full relative"
          >
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="absolute top-3 right-3 inline-flex items-center justify-center w-11 h-11 text-white/50 hover:text-white"
              aria-label="Close shortcuts dialog"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/20">
                <Keyboard size={18} className="text-[#39FF14]" aria-hidden="true" />
              </div>
              <h2
                id="shortcuts-title"
                className="text-xl font-black tracking-widest uppercase"
              >
                Shortcuts
              </h2>
            </div>
            <ul className="flex flex-col gap-2">
              {shortcuts.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-3 py-1"
                >
                  <span className="text-sm text-white/70">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k, i) => (
                      <kbd
                        key={i}
                        className="px-2 py-1 text-xs font-mono rounded bg-white/5 border border-white/10 text-white/80 min-w-[28px] text-center"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/30">
              Tip: chord shortcuts (e.g. <kbd className="px-1 rounded bg-white/5">g</kbd>{" "}
              <kbd className="px-1 rounded bg-white/5">d</kbd>) only work when no input is
              focused.{" "}
              <Link href="/" className="text-[#39FF14] hover:underline">
                Back to dashboard
              </Link>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
