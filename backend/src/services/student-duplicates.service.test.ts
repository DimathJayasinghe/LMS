import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { findPossibleDuplicates } from './student-duplicates.service';

const db = { user: { findMany: vi.fn() } };
const find = (name: string, numbers: (string | undefined)[]) => findPossibleDuplicates(db as never, 'org-1', { name, numbers });

beforeEach(() => {
  db.user.findMany.mockReset().mockResolvedValue([]);
});

describe('findPossibleDuplicates', () => {
  it('looks for students of the organization who hold the same number in either spelling, as their own or a guardian\'s', async () => {
    await find('Kasun Silva', ['+94771234567', '+94712345678']);

    const where = db.user.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ organizationId: 'org-1', role: Role.STUDENT });
    expect(where.OR).toEqual([
      { phone: { in: ['+94771234567', '0771234567', '+94712345678', '0712345678'] } },
      { guardianMobile: { in: ['+94771234567', '0771234567', '+94712345678', '0712345678'] } },
    ]);
  });

  it('does not query at all without a number', async () => {
    expect(await find('Kasun Silva', [undefined, undefined])).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('flags the same name on the same number and leaves out a sibling', async () => {
    db.user.findMany.mockResolvedValue([
      { id: 'a', name: 'Kasun Silva', indexNumber: 7 },
      { id: 'b', name: 'Sachini Silva', indexNumber: 9 },
    ]);

    expect(await find('Kasun  Silva', ['+94771234567'])).toEqual([{ id: 'a', name: 'Kasun Silva', indexNumber: 7 }]);
  });

  it('shows the clerk at most five and only name and index number', async () => {
    db.user.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: 'Kasun Silva', indexNumber: i + 1 })));
    const found = await find('Kasun Silva', ['+94771234567']);
    expect(found).toHaveLength(5);
    expect(Object.keys(found[0]!).sort()).toEqual(['id', 'indexNumber', 'name']);
  });
});
