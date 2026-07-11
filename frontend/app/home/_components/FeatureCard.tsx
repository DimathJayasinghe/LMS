"use client";

import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import type { MouseEvent, ReactNode } from "react";

export interface FeatureCardData {
  /** Pre-rendered icon element (e.g. `<Video className="size-6" />`) — a
   * component *reference* can't cross the server/client boundary, but an
   * already-rendered element can. */
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * A feature tile with a cursor-tracking spotlight (radial gradient pinned to
 * the pointer position via CSS custom properties, so it never triggers a
 * React re-render) and a small hover lift.
 */
export default function FeatureCard({ icon, title, description }: FeatureCardData) {
  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(50);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(((e.clientX - rect.left) / rect.width) * 100);
    mouseY.set(((e.clientY - rect.top) / rect.height) * 100);
  };

  const background = useMotionTemplate`radial-gradient(220px circle at ${mouseX}% ${mouseY}%, var(--color-primary) 0%, transparent 70%)`;

  return (
    <motion.div
      onMouseMove={handleMove}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-8 text-card-foreground"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-10"
        style={{ background }}
      />

      <span className="relative flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <h3 className="relative mt-5 text-lg font-medium text-foreground">{title}</h3>
      <p className="relative mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </motion.div>
  );
}
