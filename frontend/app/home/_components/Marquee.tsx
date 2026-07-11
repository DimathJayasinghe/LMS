"use client";

import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const ITEMS = [
  "Live classes",
  "Recorded video",
  "Exams & results",
  "Attendance tracking",
  "Physics",
  "Chemistry",
  "Combined Maths",
  "Biology",
  "ICT",
  "Secure payments",
];

/**
 * A tilted, infinitely-scrolling banner. Pure CSS animation (no per-frame
 * JS) — the track is rendered twice back to back and translated by exactly
 * one copy's width, so the loop is seamless regardless of item count.
 * Decorative only (the same info lives in Features), so it's hidden from
 * assistive tech rather than duplicated into it.
 */
export default function Marquee() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden className="relative overflow-hidden py-10 sm:py-14">
      <div
        className="-rotate-2 border-y border-foreground bg-foreground py-4 sm:py-5"
        style={{ width: "120%", marginLeft: "-10%" }}
      >
        <div
          className={cn(
            "flex w-max",
            !reduceMotion && "animate-marquee",
          )}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {ITEMS.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-10 whitespace-nowrap pr-10 text-lg font-medium uppercase tracking-wide text-background sm:gap-14 sm:pr-14 sm:text-xl"
                >
                  {item}
                  <span className="text-background/40">✦</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
