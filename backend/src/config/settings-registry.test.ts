import { describe, expect, it } from 'vitest';
import { settingsRegistry } from './settings-registry';

describe('settings registry', () => {
  it('defines the grace defaults and rejects invalid values', () => {
    expect(settingsRegistry['fees.graceDays'].default).toBe(10);
    expect(settingsRegistry['fees.graceRequiresPreviousMonthPaid'].default).toBe(true);
    expect(settingsRegistry['fees.graceDays'].schema.safeParse(0).success).toBe(true);
    expect(settingsRegistry['fees.graceDays'].schema.safeParse(32).success).toBe(false);
    expect(settingsRegistry['fees.graceDays'].schema.safeParse(1.5).success).toBe(false);
  });
  it('keeps temporary passwords within the credential byte limit', () => {
    expect(settingsRegistry['identity.tempPassword.length'].schema.safeParse(73).success).toBe(false);
  });
  it('keeps the timetable generation window at least as long as the weekly job interval', () => {
    const { schema } = settingsRegistry['timetable.generateAheadDays'];
    expect(schema.safeParse(6).success).toBe(false);
    expect(schema.safeParse(7).success).toBe(true);
  });
  it('accepts every registered default', () => {
    for (const entry of Object.values(settingsRegistry)) expect(entry.schema.safeParse(entry.default).success).toBe(true);
  });
  it('preserves fixed marking policy', () => {
    expect(settingsRegistry['exams.marking.markerMayOverrideTeacher'].schema.safeParse(true).success).toBe(false);
  });
});
