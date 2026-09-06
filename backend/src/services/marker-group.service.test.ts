import { MarkerGroupScope, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	markerGroupCreate,
	markerGroupFindMany,
	markerGroupFindUnique,
	markerGroupUpdate,
	markerGroupMemberFindMany,
	markerGroupMemberCreateMany,
	markerGroupMemberUpdate,
	markerGroupMemberUpdateMany,
	membershipEventCreate,
	membershipEventFindMany,
	userFindMany,
	courseFindUnique,
	subjectFindUnique,
	instituteFindUnique,
	transaction,
} = vi.hoisted(() => ({
	markerGroupCreate: vi.fn(),
	markerGroupFindMany: vi.fn(),
	markerGroupFindUnique: vi.fn(),
	markerGroupUpdate: vi.fn(),
	markerGroupMemberFindMany: vi.fn(),
	markerGroupMemberCreateMany: vi.fn(),
	markerGroupMemberUpdate: vi.fn(),
	markerGroupMemberUpdateMany: vi.fn(),
	membershipEventCreate: vi.fn(),
	membershipEventFindMany: vi.fn(),
	userFindMany: vi.fn(),
	courseFindUnique: vi.fn(),
	subjectFindUnique: vi.fn(),
	instituteFindUnique: vi.fn(),
	transaction: vi.fn(),
}));

const tx = {
	markerGroup: { create: markerGroupCreate, update: markerGroupUpdate },
	markerGroupMember: {
		findMany: markerGroupMemberFindMany,
		createMany: markerGroupMemberCreateMany,
		update: markerGroupMemberUpdate,
		updateMany: markerGroupMemberUpdateMany,
	},
		markerGroupMembershipEvent: { create: membershipEventCreate, findMany: membershipEventFindMany },
	user: { findMany: userFindMany },
};

vi.mock('@/config/database', () => ({
	prisma: {
		markerGroup: {
			create: markerGroupCreate,
			findMany: markerGroupFindMany,
			findUnique: markerGroupFindUnique,
			update: markerGroupUpdate,
		},
		markerGroupMember: { findMany: markerGroupMemberFindMany, update: markerGroupMemberUpdate },
		markerGroupMembershipEvent: { findMany: membershipEventFindMany },
		user: { findMany: userFindMany },
		course: { findUnique: courseFindUnique },
		subject: { findUnique: subjectFindUnique },
		institute: { findUnique: instituteFindUnique },
		$transaction: transaction,
	},
}));

import {
	createMarkerGroup,
	getMarkerGroup,
	listMarkerGroupHistory,
	listMarkerGroups,
	replaceMarkerGroupMembers,
	updateMarkerGroup,
} from './marker-group.service';

const superAdmin = { userId: 'super-admin', role: Role.SUPER_ADMIN };
const owningTeacher = { userId: 'teacher-1', role: Role.TEACHER };
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER };
const group = {
	id: 'group-a',
	name: 'Term markers',
	description: null,
	scope: MarkerGroupScope.COURSE,
	courseId: 'course-1',
	subjectId: null,
	instituteId: null,
	isActive: true,
	deletedAt: null,
	revision: 0,
	createdById: 'teacher-1',
	course: { id: 'course-1', teacherId: 'teacher-1' },
	createdAt: new Date('2026-09-06T00:00:00.000Z'),
	updatedAt: new Date('2026-09-06T00:00:00.000Z'),
};

const createInput = { name: 'Term markers', scope: MarkerGroupScope.COURSE, courseId: 'course-1' };

beforeEach(() => {
	vi.resetAllMocks();
	transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
	markerGroupCreate.mockResolvedValue(group);
	markerGroupFindMany.mockResolvedValue([]);
	markerGroupFindUnique.mockResolvedValue(group);
	markerGroupUpdate.mockResolvedValue(group);
	markerGroupMemberFindMany.mockResolvedValue([]);
	markerGroupMemberCreateMany.mockResolvedValue({ count: 0 });
	markerGroupMemberUpdate.mockResolvedValue({ id: 'member-1' });
	markerGroupMemberUpdateMany.mockResolvedValue({ count: 0 });
	membershipEventCreate.mockResolvedValue({ id: 'event-1' });
	membershipEventFindMany.mockResolvedValue([]);
	userFindMany.mockResolvedValue([{ id: 'marker-a', name: 'Marker A' }]);
	courseFindUnique.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	subjectFindUnique.mockResolvedValue({ id: 'subject-1' });
	instituteFindUnique.mockResolvedValue({ id: 'institute-1' });
});

describe('marker group authorization and immutable membership history', () => {
	it('allows a super-admin to create course, subject, and institute groups', async () => {
		for (const input of [
			createInput,
			{ name: 'Physics markers', scope: MarkerGroupScope.SUBJECT, subjectId: 'subject-1' },
			{ name: 'Center markers', scope: MarkerGroupScope.INSTITUTE, instituteId: 'institute-1' },
		]) {
			await createMarkerGroup(input, superAdmin);
		}

		expect(markerGroupCreate).toHaveBeenCalledTimes(3);
	});

	it('allows a teacher to create a group only for their own course', async () => {
		await createMarkerGroup(createInput, owningTeacher);
		expect(markerGroupCreate).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({ courseId: 'course-1', createdById: 'teacher-1' }),
		}));
	});

	it('rejects a teacher creating a group for another course', async () => {
		courseFindUnique.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
		await expect(createMarkerGroup(createInput, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE', statusCode: 403,
		});
	});

	it('rejects a teacher creating a subject or institute group', async () => {
		await expect(createMarkerGroup({ name: 'Subject', scope: MarkerGroupScope.SUBJECT, subjectId: 'subject-1' }, owningTeacher))
			.rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		await expect(createMarkerGroup({ name: 'Institute', scope: MarkerGroupScope.INSTITUTE, instituteId: 'institute-1' }, owningTeacher))
			.rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
	});

	it.each([Role.ADMIN, Role.MARKER, Role.STUDENT])('rejects %s configuration', async (role) => {
		await expect(createMarkerGroup(createInput, { userId: `${role}-1`, role })).rejects.toMatchObject({
			code: 'FORBIDDEN', statusCode: 403,
		});
	});

	it('deduplicates member IDs and appends only the resulting additions', async () => {
		userFindMany.mockResolvedValue([
			{ id: 'marker-a', name: 'Marker A' },
			{ id: 'marker-b', name: 'Marker B' },
		]);

		await replaceMarkerGroupMembers('group-a', {
			markerIds: ['marker-a', 'marker-a', 'marker-b'], reason: 'Semester allocation',
		}, owningTeacher);

		expect(markerGroupMemberCreateMany).toHaveBeenCalledWith(expect.objectContaining({
			data: [
				{ groupId: 'group-a', markerId: 'marker-a', addedById: 'teacher-1' },
				{ groupId: 'group-a', markerId: 'marker-b', addedById: 'teacher-1' },
			],
		}));
		expect(membershipEventCreate).toHaveBeenCalledTimes(2);
		expect(markerGroupUpdate).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'group-a' }, data: { revision: { increment: 1 } },
		}));
	});

	it('rejects inactive, deleted, missing, and wrong-role requested members before changing membership', async () => {
		userFindMany.mockResolvedValue([{ id: 'marker-a', name: 'Marker A' }]);

		await expect(replaceMarkerGroupMembers('group-a', {
			markerIds: ['marker-a', 'not-a-marker'], reason: 'Semester allocation',
		}, owningTeacher)).rejects.toMatchObject({ code: 'INVALID_MARKER_IDS' });
		expect(markerGroupMemberUpdate).not.toHaveBeenCalled();
		expect(membershipEventCreate).not.toHaveBeenCalled();
		expect(markerGroupUpdate).not.toHaveBeenCalled();
	});

	it('requires a reason for an exact member replacement', async () => {
		await expect(replaceMarkerGroupMembers('group-a', { markerIds: ['marker-a'], reason: '' }, owningTeacher))
			.rejects.toMatchObject({ code: 'MEMBERSHIP_REASON_REQUIRED', statusCode: 400 });
	});

	it('returns not found for a missing group before applying mutation', async () => {
		markerGroupFindUnique.mockResolvedValue(null);
		await expect(updateMarkerGroup('missing-group', { name: 'Renamed' }, superAdmin))
			.rejects.toMatchObject({ code: 'MARKER_GROUP_NOT_FOUND', statusCode: 404 });
		expect(markerGroupUpdate).not.toHaveBeenCalled();
	});

	it('replaces active membership while recording removals and replays the same final set safely', async () => {
		markerGroupMemberFindMany.mockResolvedValue([{ markerId: 'marker-a' }, { markerId: 'marker-c' }]);
		userFindMany.mockResolvedValue([{ id: 'marker-a', name: 'Marker A' }, { id: 'marker-b', name: 'Marker B' }]);

		await replaceMarkerGroupMembers('group-a', {
			markerIds: ['marker-a', 'marker-b'], reason: 'Semester allocation',
		}, owningTeacher);

		expect(markerGroupMemberUpdate).toHaveBeenCalledWith(expect.objectContaining({
			where: { groupId_markerId: { groupId: 'group-a', markerId: 'marker-c' } },
			data: { removedById: 'teacher-1', removedAt: expect.any(Date) },
		}));
		expect(membershipEventCreate).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({ markerId: 'marker-c', action: 'REMOVED', reason: 'Semester allocation' }),
		}));

		markerGroupMemberFindMany.mockResolvedValue([{ markerId: 'marker-a' }, { markerId: 'marker-b' }]);
		await replaceMarkerGroupMembers('group-a', {
			markerIds: ['marker-b', 'marker-a'], reason: 'Same membership retry',
		}, owningTeacher);
		expect(markerGroupMemberCreateMany).toHaveBeenCalledTimes(1);
		expect(markerGroupMemberUpdate).toHaveBeenCalledTimes(1);
	});

	it('scopes group details and membership history to the owning teacher or super-admin', async () => {
		await expect(getMarkerGroup('group-a', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE', statusCode: 403,
		});
		await expect(listMarkerGroupHistory('group-a', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE', statusCode: 403,
		});
		await listMarkerGroupHistory('group-a', superAdmin);
		expect(markerGroupFindUnique).toHaveBeenCalled();
	});

	it('lists only groups visible to an owning teacher and all groups to a super-admin', async () => {
		await listMarkerGroups(owningTeacher);
		expect(markerGroupFindMany).toHaveBeenCalledWith(expect.objectContaining({
			where: expect.objectContaining({ course: { teacherId: 'teacher-1' } }),
		}));
		await listMarkerGroups(superAdmin);
		expect(markerGroupFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
			where: expect.objectContaining({ deletedAt: null }),
		}));
	});
});
