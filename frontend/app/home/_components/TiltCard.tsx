"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A card that tilts in 3D toward the cursor (rotateX/rotateY driven by
 * pointer position, spring-smoothed) with a matching light-sweep highlight.
 * Springs — not raw motion values — because a direct 1:1 tilt reads as
 * jittery/mechanical; the spring gives it weight. Disabled under reduced
 * motion: the card stays flat and only the highlight fades in on hover.
 */
export default function TiltCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  const rotateX = useSpring(0, { stiffness: 300, damping: 25 });
  const rotateY = useSpring(0, { stiffness: 300, damping: 25 });
  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(50);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    mouseX.set(px * 100);
    mouseY.set(py * 100);
    rotateY.set((px - 0.5) * 20);
    rotateX.set((0.5 - py) * 20);
  };

  const handleLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const highlight = useMotionTemplate`radial-gradient(180px circle at ${mouseX}% ${mouseY}%, var(--color-primary) 0%, transparent 70%)`;

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <motion.div
        aria-hidden
        style={{ background: highlight }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-10"
      />
      {children}
    </motion.div>
  );
}
