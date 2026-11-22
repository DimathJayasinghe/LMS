import { describe, expect, it } from 'vitest';
import { findSlotConflicts, type SlotRow } from './handover-conflicts';

const slot = (courseId: string, dayOfWeek: number, startTime: string, durationMinutes = 60): SlotRow => ({
  id: `${courseId}-${dayOfWeek}-${startTime}`, courseId, courseName: `Course ${courseId}`, dayOfWeek, startTime, durationMinutes,
});

describe('findSlotConflicts', () => {
  it('finds nothing when the new teacher is free at those times', () => {
    const moving = [slot('a', 1, '16:00')];
    const target = [{ ...slot('x', 1, '18:00'), teacherId: 't2' }, { ...slot('y', 2, '16:00'), teacherId: 't2' }];
    expect(findSlotConflicts([{ courseId: 'a', toTeacherId: 't2' }], moving, target)).toEqual([]);
  });

  it('reports a clash with a class the new teacher already runs, on the same day and overlapping minutes', () => {
    const moving = [slot('a', 1, '16:00', 90)];
    const target = [{ ...slot('x', 1, '17:00'), teacherId: 't2' }];

    expect(findSlotConflicts([{ courseId: 'a', toTeacherId: 't2' }], moving, target)).toEqual([
      { toTeacherId: 't2', courseId: 'a', courseName: 'Course a', dayOfWeek: 1, startTime: '16:00', durationMinutes: 90, clashesWith: { courseName: 'Course x', startTime: '17:00', durationMinutes: 60 } },
    ]);
  });

  it('ignores a class that belongs to a different teacher than the one receiving', () => {
    const moving = [slot('a', 1, '16:00')];
    const target = [{ ...slot('x', 1, '16:00'), teacherId: 'someone-else' }];
    expect(findSlotConflicts([{ courseId: 'a', toTeacherId: 't2' }], moving, target)).toEqual([]);
  });

  it('allows back-to-back classes', () => {
    const moving = [slot('a', 1, '16:00')];
    const target = [{ ...slot('x', 1, '17:00'), teacherId: 't2' }];
    expect(findSlotConflicts([{ courseId: 'a', toTeacherId: 't2' }], moving, target)).toEqual([]);
  });

  it('reports a clash between two classes being handed to the same teacher, once', () => {
    const moving = [slot('a', 3, '16:00'), slot('b', 3, '16:30')];
    const moves = [{ courseId: 'a', toTeacherId: 't2' }, { courseId: 'b', toTeacherId: 't2' }];

    const conflicts = findSlotConflicts(moves, moving, []);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ toTeacherId: 't2', dayOfWeek: 3 });
  });

  it('lets two overlapping classes go to different teachers', () => {
    const moving = [slot('a', 3, '16:00'), slot('b', 3, '16:30')];
    const moves = [{ courseId: 'a', toTeacherId: 't2' }, { courseId: 'b', toTeacherId: 't3' }];
    expect(findSlotConflicts(moves, moving, [])).toEqual([]);
  });

  it('is quiet for a class with no timetable', () => {
    expect(findSlotConflicts([{ courseId: 'a', toTeacherId: 't2' }], [], [{ ...slot('x', 1, '16:00'), teacherId: 't2' }])).toEqual([]);
  });
});
