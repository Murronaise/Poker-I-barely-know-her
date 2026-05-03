"use client";

import React from "react";
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
  const isMounted = useIsMounted();
  // Read the stored position synchronously on the client; fall back to default
  // during SSR / first render so server and client markup match.
  const resolvedPos: AvatarPosition =
    position ?? (isMounted && avatarUrl ? getAvatarPosition(name) : defaultAvatarPosition);

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
          className="w-full h-full object-cover"
          style={{
            objectPosition: `${resolvedPos.x}% ${resolvedPos.y}%`,
            transform: `scale(${resolvedPos.scale})`,
            transformOrigin: `${resolvedPos.x}% ${resolvedPos.y}%`,
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
