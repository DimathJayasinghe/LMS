import { timeRangesOverlap } from '@/utils/time-range';

export interface SlotRow {
  id: string;
  courseId: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
}

export interface HandoverMove {
  courseId: string;
  toTeacherId: string;
}

export interface SlotConflict {
  toTeacherId: string;
  courseId: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  clashesWith: { courseName: string; startTime: string; durationMinutes: number };
}

const clash = (a: SlotRow, b: SlotRow): boolean =>
  a.dayOfWeek === b.dayOfWeek && timeRangesOverlap(a.startTime, a.durationMinutes, b.startTime, b.durationMinutes);

/**
 * Timetable clashes a hand-over would create: a moved class overlapping a class its new teacher already runs, or two
 * moved classes landing on the same teacher at the same time. `moving` holds the active slots of the moved classes and
 * `receiving` the active slots of the classes each new teacher already owns (with their owner's id). Pure.
 */
export const findSlotConflicts = (
  moves: HandoverMove[],
  moving: SlotRow[],
  receiving: (SlotRow & { teacherId: string })[],
): SlotConflict[] => {
  const teacherOf = new Map(moves.map((move) => [move.courseId, move.toTeacherId]));
  const conflicts: SlotConflict[] = [];

  for (const slot of moving) {
    const toTeacherId = teacherOf.get(slot.courseId);
    if (!toTeacherId) continue;
    const others = [
      ...receiving.filter((other) => other.teacherId === toTeacherId),
      // A pair of moved classes is reported once, from the slot of the lower course id.
      ...moving.filter((other) => other.courseId !== slot.courseId && other.courseId > slot.courseId && teacherOf.get(other.courseId) === toTeacherId),
    ];
    for (const other of others) {
      if (!clash(slot, other)) continue;
      conflicts.push({
        toTeacherId,
        courseId: slot.courseId,
        courseName: slot.courseName,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes,
        clashesWith: { courseName: other.courseName, startTime: other.startTime, durationMinutes: other.durationMinutes },
      });
    }
  }
  return conflicts;
};
