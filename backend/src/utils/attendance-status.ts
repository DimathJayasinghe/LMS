import { AttendanceStatus } from '@prisma/client';

/** The statuses that count as having attended: a live join below the minimum (PARTIAL) and an excused absence do not. */
export const ATTENDED_STATUSES: AttendanceStatus[] = [AttendanceStatus.PRESENT, AttendanceStatus.LATE];
