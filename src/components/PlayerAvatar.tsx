"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { getAvatarPosition, type AvatarPosition, defaultAvatarPosition } from "@/lib/local-store";
import { useIsMounted } from "@/lib/use-hydration";

type PlayerAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  isSelected?: boolean;
  /** Override stored position. If omitted, looks up by name in localStorage. */
  position?: AvatarPosition;
};

export default function PlayerAvatar({
  name,
  avatarUrl,
  size = 48,
  className = "",
  isSelected = false,
  position,
}: PlayerAvatarProps) {
  // Avatar framing comes from localStorage and varies between SSR (none) and
  // the client (saved value). To stop the avatar from visibly jumping during
  // hydration we keep opacity at 0 until the stored position is resolved.
  // For callers that pass an explicit `position` prop we already have the
  // value at first paint, so there's nothing to wait for.
  const isMounted = useIsMounted();
  const resolvedPos = useMemo<AvatarPosition | null>(() => {
    if (position) return position;
    if (!isMounted) return null;
    return avatarUrl ? getAvatarPosition(name) : defaultAvatarPosition;
  }, [isMounted, position, avatarUrl, name]);
  const positionReady = resolvedPos !== null;
  const drawPos = resolvedPos ?? defaultAvatarPosition;

  // Custom uploaded image — render plain img so objectPosition + transform compose correctly
  if (avatarUrl) {
    return (
      <div
        className={`relative overflow-hidden flex-shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover transition-opacity"
          style={{
            objectPosition: `${drawPos.x}% ${drawPos.y}%`,
            transform: `scale(${drawPos.scale})`,
            transformOrigin: `${drawPos.x}% ${drawPos.y}%`,
            opacity: positionReady ? 1 : 0,
          }}
          draggable={false}
        />
      </div>
    );
  }

  // Fallback to neon initial generator
  const background = isSelected ? "39FF14" : "0E1117";
  const color = isSelected ? "000000" : "39FF14";

  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${background}&color=${color}&bold=true&rounded=true&size=${size * 2}`;

  return (
    <div
      className={`relative overflow-hidden flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={fallbackUrl}
        alt={name}
        fill
        sizes={`${size}px`}
        className="object-cover"
        unoptimized
      />
    </div>
  );
}
