import { ApiError } from "@/lib/api";

export interface HandoverCourse {
  id: string;
  name: string;
  year: number;
  subjectName: string;
  isActive: boolean;
  upcomingSessions: number;
  openExams: number;
}

export interface MarkerAllocation {
  examId: string;
  examTitle: string;
  courseName: string;
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

/** Why a deactivation or role change stopped short, read from the 409 the API answers with. */
export type HandoverBlock =
  | { kind: "classes"; courses: HandoverCourse[] }
  | { kind: "marking"; allocations: MarkerAllocation[] }
  | { kind: "clash"; conflicts: SlotConflict[] };

const list = (details: unknown, key: string): unknown[] | null => {
  const value = (details as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(value) ? value : null;
};

export function readHandoverBlock(error: unknown): HandoverBlock | null {
  if (!(error instanceof ApiError)) return null;
  const courses = list(error.details, "courses");
  const allocations = list(error.details, "markerAllocations");
  const conflicts = list(error.details, "conflicts");
  if (error.code === "TEACHER_HAS_CLASSES" && courses) return { kind: "classes", courses: courses as HandoverCourse[] };
  if (error.code === "MARKER_HAS_ALLOCATIONS" && allocations) return { kind: "marking", allocations: allocations as MarkerAllocation[] };
  if (error.code === "HANDOVER_SLOT_CONFLICT" && conflicts) return { kind: "clash", conflicts: conflicts as SlotConflict[] };
  return null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayName = (dayOfWeek: number): string => DAYS[dayOfWeek] ?? "";
