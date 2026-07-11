"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";

// Fixed px cell, not a percentage of the container — a percentage-based grid
// (the old implementation) reflows into a different number of unevenly-sized
// boxes at every viewport width, which is what fell apart on mobile. A fixed
// cell size just tiles more or fewer times; the pattern itself never distorts.
const CELL = 44;

interface GridBackdropProps {
  className?: string;
  /** Ties the grid to page scroll for a subtle parallax drift. Only the home
   * hero wants this; the auth aside stays static. */
  parallax?: boolean;
}

/**
 * The site's "grid that reacts to you" motif — shared by the landing-page
 * hero and the auth-screen aside so both get the same fix in one place.
 *
 * Previously this was ~100-120 individual `<span>`s with a per-cell CSS
 * `:hover`, which (a) required the pointer to land on one exact ~cell-sized
 * box to do anything, and (b) used percentage widths that produced a
 * different, sometimes-ragged column count at every breakpoint. This version
 * is two CSS background patterns (no per-cell DOM cost, so it can't distort)
 * plus a soft glow + a primary-tinted copy of the grid masked to a circle
 * that follows the pointer — genuinely interactive at any position over the
 * whole area, not just exact cell hits. `onPointerMove` (not `onMouseMove`)
 * so touch/pen input drives it too.
 */
export default function GridBackdrop({ className, parallax = false }: GridBackdropProps) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, parallax && !reduceMotion ? 120 : 0]);

  // Off-screen until the first pointer event so the spotlight doesn't default
  // to the top-left corner before anyone has moved the pointer.
  const pointerX = useMotionValue(-9999);
  const pointerY = useMotionValue(-9999);

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointerX.set(e.clientX - rect.left);
    pointerY.set(e.clientY - rect.top);
  };

  const handlePointerLeave = () => {
    pointerX.set(-9999);
    pointerY.set(-9999);
  };

  const glow = useMotionTemplate`radial-gradient(320px circle at ${pointerX}px ${pointerY}px, var(--color-primary) 0%, transparent 70%)`;
  const spotlightMask = useMotionTemplate`radial-gradient(220px circle at ${pointerX}px ${pointerY}px, black, transparent 70%)`;

  const lineStyle = (color: string) => ({
    backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
    backgroundSize: `${CELL}px ${CELL}px`,
  });

  return (
    <motion.div
      aria-hidden
      style={parallax ? { y } : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      {/* Base pattern — always visible, independent of pointer position. */}
      <div className="absolute inset-0 opacity-40" style={lineStyle("var(--color-border)")} />

      {/* Soft ambient glow under the pointer. */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{ background: glow }}
      />

      {/* Primary-tinted copy of the same pattern, masked to a circle that
          tracks the pointer — the part that actually reacts. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          ...lineStyle("var(--color-primary)"),
          WebkitMaskImage: spotlightMask,
          maskImage: spotlightMask,
        }}
      />
    </motion.div>
  );
}
