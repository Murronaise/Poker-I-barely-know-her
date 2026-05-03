"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, RotateCcw, Move } from "lucide-react";
import {
  getAvatarPosition,
  setAvatarPosition,
  defaultAvatarPosition,
  type AvatarPosition,
} from "@/lib/local-store";

type Props = {
  name: string;
  avatarUrl: string;
  size?: number;
  /** Called whenever position changes — useful for live preview elsewhere. */
  onChange?: (pos: AvatarPosition) => void;
  /** When true, also persist to localStorage on every change. Default true. */
  autosave?: boolean;
};

export default function AvatarPositioner({
  name,
  avatarUrl,
  size = 200,
  onChange,
  autosave = true,
}: Props) {
  const [pos, setPos] = useState<AvatarPosition>(() =>
    typeof window === "undefined" ? defaultAvatarPosition : getAvatarPosition(name),
  );
  // Reset stored position when the `name` prop changes (the React-sanctioned
  // "previous prop" pattern — see https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [prevName, setPrevName] = useState(name);
  if (prevName !== name) {
    setPrevName(name);
    setPos(getAvatarPosition(name));
  }
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notify parent when position changes
  useEffect(() => {
    onChange?.(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const persist = (next: AvatarPosition) => {
    setPos(next);
    if (autosave) setAvatarPosition(name, next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;

    // Convert pixel drag into percentage. Drag right = decrease x% (to reveal more of right side of image)
    // We invert because objectPosition x means "what % of the image aligns with the container's center".
    const dxPct = (dx / rect.width) * 100;
    const dyPct = (dy / rect.height) * 100;

    const next: AvatarPosition = {
      x: clamp(dragStateRef.current.startPosX - dxPct, 0, 100),
      y: clamp(dragStateRef.current.startPosY - dyPct, 0, 100),
      scale: pos.scale,
    };
    persist(next);
  };

  const onPointerUp = () => {
    dragStateRef.current = null;
  };

  const onScale = (e: React.ChangeEvent<HTMLInputElement>) => {
    const scale = Number(e.target.value);
    persist({ ...pos, scale });
  };

  const reset = () => persist(defaultAvatarPosition);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-white/40">
        <Move size={11} />
        Drag to reposition · scroll-zoom slider below
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative rounded-full overflow-hidden border-4 border-white/10 cursor-grab active:cursor-grabbing select-none mx-auto bg-black/40"
        style={{ width: size, height: size, touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover pointer-events-none"
          style={{
            objectPosition: `${pos.x}% ${pos.y}%`,
            transform: `scale(${pos.scale})`,
            transformOrigin: `${pos.x}% ${pos.y}%`,
          }}
          draggable={false}
        />
        {/* Crosshair guide */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white/40" />
        </div>
      </div>

      <div>
        <label className="flex items-center justify-between gap-3 text-xs font-bold tracking-widest uppercase text-white/50 mb-2">
          <span className="flex items-center gap-1.5">
            <ZoomIn size={12} className="text-[#39FF14]" /> Zoom
          </span>
          <span className="font-mono text-white/40">{pos.scale.toFixed(2)}×</span>
        </label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={pos.scale}
          onChange={onScale}
          className="w-full accent-[#39FF14]"
        />
      </div>

      <button
        type="button"
        onClick={reset}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold tracking-widest uppercase px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white transition-colors"
      >
        <RotateCcw size={12} /> Reset Position
      </button>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
