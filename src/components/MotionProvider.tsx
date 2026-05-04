"use client";

import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";

/**
 * Wraps the app in a `MotionConfig` that mirrors the user's
 * `prefers-reduced-motion` setting. When true, Framer skips most transforms
 * and transitions, so the dashboard stays usable on devices that opt out of
 * animation (or for users with vestibular sensitivities).
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
