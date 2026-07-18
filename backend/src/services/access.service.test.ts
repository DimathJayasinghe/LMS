import { describe, it, expect, vi, beforeEach } from 'vitest';

const { markerAssignmentFindUnique } = vi.hoisted(() => ({
	markerAssignmentFindUnique: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		markerAssignment: { findUnique: markerAssignmentFindUnique },
	},
}));

import { assertMarkerAssignedToExam } from './access.service';

beforeEach(() => {
	markerAssignmentFindUnique.mockReset();
});

describe('assertMarkerAssignedToExam', () => {
	it('resolves when the marker is assigned to the exam', async () => {
		markerAssignmentFindUnique.mockResolvedValueOnce({ markerId: 'm1', examId: 'e1' });

		await expect(assertMarkerAssignedToExam('m1', 'e1')).resolves.toBeUndefined();
		expect(markerAssignmentFindUnique).toHaveBeenCalledWith({
			where: { markerId_examId: { markerId: 'm1', examId: 'e1' } },
		});
	});

	it('throws 403 MARKER_NOT_ASSIGNED when there is no assignment', async () => {
		markerAssignmentFindUnique.mockResolvedValueOnce(null);

		await expect(assertMarkerAssignedToExam('m1', 'e1')).rejects.toMatchObject({
			code: 'MARKER_NOT_ASSIGNED',
			statusCode: 403,
		});
	});
});
