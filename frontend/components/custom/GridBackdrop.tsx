"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// Fixed px cell (not a percentage of the container) — a percentage-based
// grid reflows into a different, sometimes-ragged column count at every
// viewport width. `auto-fill`/`minmax` instead computes however many equal
// columns fit and stretches them evenly, so cells stay square and
// undistorted at any width — the actual box count is "dynamic" per
// viewport, not a fixed layout baked in for one breakpoint.
const CELL = 96;
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
 * The graph-paper backdrop shared by the landing-page hero and the
 * auth-screen aside. A static `auto-fill`/`minmax` CSS grid of real
 * bordered, rounded boxes — no per-cell DOM-width math, so it can't
 * distort at any viewport width.
 */
export default function GridBackdrop({
  className,
  parallax = false,
  revealCenter = false,
}: GridBackdropProps) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, parallax && !reduceMotion ? 120 : 0]);

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${CELL}px, 1fr))`,
    gap: 0,
  };

  return (
    <motion.div
      aria-hidden
      style={parallax ? { y } : undefined}
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      <div style={gridStyle} className="absolute inset-0 opacity-70">
        {cells.map((_, i) => (
          <div key={i} className="aspect-square rounded-xl border border-border/50" />
        ))}
      </div>

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
