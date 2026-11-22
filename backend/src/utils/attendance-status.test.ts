import { describe, expect, it } from 'vitest';
import { AttendanceStatus } from '@prisma/client';
import { ATTENDED_STATUSES } from './attendance-status';

describe('ATTENDED_STATUSES', () => {
  it('counts present and late, and nothing that is only a partial join or an excused absence', () => {
    expect(ATTENDED_STATUSES).toEqual([AttendanceStatus.PRESENT, AttendanceStatus.LATE]);
    expect(ATTENDED_STATUSES).not.toContain(AttendanceStatus.PARTIAL);
    expect(ATTENDED_STATUSES).not.toContain(AttendanceStatus.EXCUSED);
  });
});
