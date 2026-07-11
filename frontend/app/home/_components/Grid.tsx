"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * The signature graph-paper backdrop behind the hero. CSS-only hover, plus a
 * subtle scroll-linked parallax drift (translateY tied to scroll progress)
 * for depth as the page scrolls past the hero.
 *
 * `-z-10` is load-bearing, not decoration: any sibling that gets a CSS
 * `transform` (from framer-motion or otherwise) is promoted into its own
 * stacking context and paints *above* plain static-positioned content
 * regardless of DOM order. Without a hard negative z-index here, this grid
 * — which itself always carries a transform for the parallax — could end up
 * stacking on top of the hero text instead of behind it.
 */
export default function Grid() {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, reduceMotion ? 0 : 120]);

  return (
    <motion.div
      style={{ y }}
      className="absolute inset-x-0 top-0 -z-10 flex h-[80vh] flex-wrap items-center overflow-hidden"
    >
      {Array.from({ length: 100 }).map((_, i) => (
        <span
          key={i}
          className="aspect-square w-[8%] rounded-lg border border-border/40 bg-background transition-colors duration-100 hover:border-primary/20 hover:bg-muted/50"
        />
      ))}
    </motion.div>
  );
}
