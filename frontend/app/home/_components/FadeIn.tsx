"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Mount-triggered fade + slide-up, for content that's already in the initial
 * viewport (the hero). Deliberately not `whileInView` — that sets up an
 * IntersectionObserver for content that's guaranteed visible on load, which
 * is wasted work and risks a flash-of-invisible-hero before it fires.
 */
export default function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
