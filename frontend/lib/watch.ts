/**
 * Watch-progress accumulator for marking video attendance. Because playback is
 * a Bunny iframe (Player.js events), we fold reported player times into an
 * accumulator that only counts small *forward* steps — so seeking, scrubbing to
 * the end, rewinding, or pausing can't inflate "watched" and game attendance.
 */

export const WATCH_THRESHOLD_SECONDS = 30;

/** Steps larger than this are treated as a seek, not real playback. */
const MAX_FORWARD_STEP = 2;

export interface WatchState {
  /** Accumulated forward-playback seconds. */
  watched: number;
  /** Last reported player time, to diff against. */
  lastSeconds: number;
}

export function initWatch(): WatchState {
  return { watched: 0, lastSeconds: 0 };
}

/**
 * Fold a new reported player time into the accumulator. Returns the next state
 * and whether the threshold was crossed *on this tick* (so the caller fires
 * exactly once).
 */
export function accumulateWatch(
  state: WatchState,
  seconds: number,
  threshold: number = WATCH_THRESHOLD_SECONDS,
): { state: WatchState; reached: boolean } {
  const delta = seconds - state.lastSeconds;
  const watched =
    delta > 0 && delta <= MAX_FORWARD_STEP ? state.watched + delta : state.watched;
  const reached = state.watched < threshold && watched >= threshold;
  return { state: { watched, lastSeconds: seconds }, reached };
}
