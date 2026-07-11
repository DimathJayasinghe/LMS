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

// Fixed px cell (not a percentage of the container) — a percentage-based
// grid reflows into a different, sometimes-ragged column count at every
// viewport width. `auto-fill`/`minmax` instead computes however many equal
// columns fit and stretches them evenly, so cells stay square and
// undistorted at any width — the actual box count is "dynamic" per
// viewport, not a fixed layout baked in for one breakpoint.
const CELL = 96;
const GAP = 0;
// Generous upper bound so even a large desktop hero never runs out of cells
// before the bottom edge — `overflow-hidden` on the container crops the rest.
const CELL_COUNT = 320;
const cells = Array.from({ length: CELL_COUNT });

interface GridBackdropProps {
  className?: string;
  /** Ties the grid to page scroll for a subtle parallax drift. Only the home
   * hero wants this; the auth aside stays static. */
  parallax?: boolean;
  /** Fades the boxes into the background around the container's center (in
   * relative %, so it scales with the container at any breakpoint) so
   * content placed on top — like the hero heading — reads cleanly instead
   * of fighting a wall of boxes underneath it. */
  revealCenter?: boolean;
}

/**
 * The site's "grid that reacts to you" motif — shared by the landing-page
 * hero and the auth-screen aside so both get the same fix in one place.
 *
 * Two aligned `auto-fill`/`minmax` CSS grids of real bordered, rounded
 * boxes stacked on top of each other: a dim base layer, and a primary-
 * tinted copy masked to a circle that follows the pointer via
 * `onPointerMove` (covers touch/pen, not just mouse) so it lights up
 * wherever the pointer actually is, not just on an exact tiny cell hit.
 */
export default function GridBackdrop({
  className,
  parallax = false,
  revealCenter = false,
}: GridBackdropProps) {
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

  const glow = useMotionTemplate`radial-gradient(380px circle at ${pointerX}px ${pointerY}px, var(--color-primary) 0%, transparent 70%)`;
  const spotlightMask = useMotionTemplate`radial-gradient(260px circle at ${pointerX}px ${pointerY}px, black, transparent 70%)`;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${CELL}px, 1fr))`,
    gap: `${GAP}px`,
  };

  return (
    <motion.div
      aria-hidden
      style={parallax ? { y } : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      {/* Base boxes — always visible, independent of pointer position. */}
      <div style={gridStyle} className="absolute inset-0 opacity-70">
        {cells.map((_, i) => (
          <div key={i} className="aspect-square rounded-xl border border-border/50" />
        ))}
      </div>

      {/* Soft ambient glow under the pointer. */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{ background: glow }}
      />

      {/* Primary-tinted copy of the same boxes, masked to a circle that
          tracks the pointer — the part that actually reacts. */}
      <motion.div
        style={{ ...gridStyle, WebkitMaskImage: spotlightMask, maskImage: spotlightMask }}
        className="pointer-events-none absolute inset-0"
      >
        {cells.map((_, i) => (
          <div key={i} className="aspect-square rounded-xl border border-primary/70 bg-primary/10" />
        ))}
      </motion.div>

      {/* Fades the boxes to background around the center so overlaid
          content (e.g. the hero heading) reads cleanly against plain space
          instead of a wall of boxes. */}
      {revealCenter && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 65% 60% at 50% 42%, var(--background) 40%, transparent 85%)",
          }}
        />
      )}
    </motion.div>
  );
}
