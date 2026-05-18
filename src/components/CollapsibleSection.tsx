"use client";

import { useEffect, useId, useState, useRef, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  children: ReactNode;
  /** If viewport height is below this threshold, auto-collapse. Responds to resize. */
  collapseUnderHeight?: number;
  /** Optional initial state override (only applies when collapseUnderHeight=0) */
  defaultOpen?: boolean;
  /** Make the body fill remaining space (for the dominant section on a page) */
  fill?: boolean;
  className?: string;
};

export default function CollapsibleSection({
  title,
  icon,
  rightSlot,
  children,
  collapseUnderHeight = 0,
  defaultOpen = false,
  fill = false,
  className = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const manuallyToggled = useRef(false);
  const reactId = useId();
  const bodyId = `collapsible-${reactId.replace(/:/g, "")}`;

  // Auto-open/close based on viewport height; respects manual user toggle.
  // Only collapses on touch / coarse-pointer devices so desktops with short
  // browser windows don't lose content unexpectedly.
  useEffect(() => {
    if (collapseUnderHeight <= 0) return;

    const isCoarsePointer = () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;

    const check = () => {
      if (manuallyToggled.current) return;
      if (!isCoarsePointer()) {
        setOpen(true);
        return;
      }
      setOpen(window.innerHeight >= collapseUnderHeight);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [collapseUnderHeight]);

  const handleToggle = () => {
    manuallyToggled.current = true;
    setOpen((o) => !o);
  };

  return (
    <div
      className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl ${
        open && fill ? "flex-1 min-h-0 flex flex-col" : ""
      } ${className}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full min-h-11 flex items-center justify-between gap-3 px-5 py-3 select-none hover:bg-white/[0.05] transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon}
          <h2 className="text-base md:text-lg font-black tracking-widest uppercase truncate">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {rightSlot}
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
          <span className="sr-only">{open ? "Collapse" : "Expand"}</span>
        </div>
      </button>
      {open && (
        <div
          id={bodyId}
          // Soft fade-in so the body popping in doesn't feel jumpy. The
          // .animate-fade-up keyframe is already in globals.css and gets
          // suppressed under prefers-reduced-motion.
          className={`px-5 pb-5 pt-1 animate-fade-up ${fill ? "flex-1 min-h-0 overflow-auto" : ""}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
