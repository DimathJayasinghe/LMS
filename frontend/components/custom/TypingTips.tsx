"use client";

import { useReducedMotion } from "motion/react";
import { TypingAnimation } from "@/components/ui/typing-animation";

/**
 * Cycles through short tips with a typewriter effect — used on the auth
 * screens' side panel while someone fills in the form. Falls back to the
 * first tip, static, under reduced motion instead of an infinitely looping
 * type/delete cycle.
 */
export default function TypingTips({ tips }: { tips: string[] }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span>{tips[0]}</span>;
  }

  return (
    <TypingAnimation
      as="span"
      words={tips}
      loop
      startOnView={false}
      typeSpeed={35}
      deleteSpeed={20}
      pauseDelay={2400}
      // TypingAnimation's base style hardcodes a huge `leading-20` line
      // height sized for the hero's giant heading — left as-is, a wrapped
      // two-line tip gets an ~80px gap between lines and reads as two
      // separate blocks of text instead of one wrapped sentence.
      className="leading-snug tracking-normal"
    />
  );
}
