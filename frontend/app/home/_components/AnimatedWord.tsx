"use client";

import { useReducedMotion } from "motion/react";
import { TypingAnimation } from "@/components/ui/typing-animation";

/**
 * Cycles through `words` with a typewriter effect. Falls back to a static
 * final word when the user prefers reduced motion, instead of an infinitely
 * looping type/delete cycle.
 */
export default function AnimatedWord({
  words,
  className,
}: {
  words: string[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span className={className}>{words[words.length - 1]}</span>;
  }

  return (
    <TypingAnimation
      as="span"
      words={words}
      loop
      startOnView={false}
      typeSpeed={65}
      deleteSpeed={35}
      pauseDelay={1600}
      className={className}
    />
  );
}
