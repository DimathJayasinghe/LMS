import { z } from 'zod';

const int = (min: number, max: number, value: number) => ({ schema: z.number().int().min(min).max(max), default: value });
const bool = (value: boolean) => ({ schema: z.boolean(), default: value });
const policy = () => ({ schema: z.enum(['WARN', 'BLOCK']), default: 'WARN' as const });
const actions = ['ROLE_CHANGE', 'STAFF_DEACTIVATE', 'STAFF_CREATE', 'STAFF_PASSWORD_RESET', 'ERASURE'] as const;

export const settingsRegistry = {
  'fees.graceDays': int(0, 31, 10),
  'fees.graceRequiresPreviousMonthPaid': bool(true),
  'fees.arrearsReportMonths': int(0, 120, 3),
  'fees.reminderFromDay': int(1, 31, 11),
  'fees.reminderMaxPerStudentPerMonth': int(0, 31, 1),
  'fees.advanceMonthsAllowed': int(0, 24, 1),
  'fees.autoReminderEnabled': bool(false),
  'tally.enabled': bool(true),
  'tally.varianceFlagAmount': { schema: z.number().min(0).max(100000000), default: 0 },
  'bulk.maxRows': int(1, 10000, 300),
  'attendance.scan.unpaidPolicy': policy(),
  'attendance.scan.notEnrolledPolicy': policy(),
  'roster.showPaidState': bool(true),
  'roster.attendanceWindowSessions': int(1, 365, 8),
  'roster.pageSize': int(1, 500, 100),
  'exams.marking.markerMayOverrideTeacher': { schema: z.literal(false), default: false as const },
  'exams.hallMarks.maxRowsPerBatch': int(1, 10000, 500),
  'exams.hallMarks.allowDecimal': bool(false),
  'timetable.generateAheadDays': int(7, 365, 14),
  'exams.uploadGraceSeconds': int(0, 3600, 180),
  'exams.autoSubmitLeadSeconds': int(0, 300, 15),
  'identity.tempPassword.length': int(8, 72, 10),
  'identity.reset.maxPerActorPerDay': int(1, 1000, 40),
  'identity.reset.maxPerTargetPer24h': int(1, 100, 3),
  'identity.stepUp.required': bool(true),
  'identity.stepUp.actions': { schema: z.array(z.enum(actions)).max(actions.length).refine((items) => new Set(items).size === items.length), default: [...actions] },
  'identity.maxOwners': int(1, 100, 2),
  'console.lookbackDays': int(1, 3650, 30),
} as const;

export type SettingKey = keyof typeof settingsRegistry;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsRegistry)[K]['schema']>;
export const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(settingsRegistry, key);
