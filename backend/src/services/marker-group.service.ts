import { MarkerGroupMembershipAction, MarkerGroupScope, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION } from '@/utils/constants';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
	CreateMarkerGroupInput,
	ReplaceMarkerGroupMembersInput,
	UpdateMarkerGroupInput,
} from '@/schemas/marker-group.schema';

const markerDirectorySelect = { id: true, name: true } satisfies Prisma.UserSelect;

const groupAccessSelect = {
	id: true,
	scope: true,
	deletedAt: true,
	course: { select: { id: true, teacherId: true } },
} satisfies Prisma.MarkerGroupSelect;

const groupDetailSelect = {
	id: true,
	name: true,
	description: true,
	scope: true,
	isActive: true,
	revision: true,
	courseId: true,
	subjectId: true,
	instituteId: true,
	createdAt: true,
	updatedAt: true,
	members: {
		where: { removedAt: null },
		select: { marker: { select: markerDirectorySelect }, addedAt: true },
		orderBy: { marker: { name: 'asc' } },
	},
} satisfies Prisma.MarkerGroupSelect;

const writeAuditLog = (
	tx: Prisma.TransactionClient,
	action: string,
	targetId: string,
	actor: AuthenticatedUser,
	metadata?: Prisma.InputJsonValue,
) => tx.auditLog.create({
	data: {
		action,
		targetType: 'MarkerGroup',
		targetId,
		metadata,
		ip: null,
		userAgent: null,
		actorId: actor.userId,
		actorRole: actor.role,
	},
});

const assertConfigurator = (actor: AuthenticatedUser): void => {
	if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.TEACHER) {
		throw new AppError('FORBIDDEN', 403, 'Only super admins and teachers can configure marker groups.');
	}
};

const assertScopeTarget = async (input: CreateMarkerGroupInput, actor: AuthenticatedUser): Promise<void> => {
	assertConfigurator(actor);
	if (input.scope !== MarkerGroupScope.COURSE && actor.role !== Role.SUPER_ADMIN) {
		throw new AppError('FORBIDDEN', 403, 'Only super admins can manage subject or institute marker groups.');
	}

	if (input.scope === MarkerGroupScope.COURSE) {
		const course = await prisma.course.findUnique({
			where: { id: input.courseId! }, select: { id: true, teacherId: true },
		});
		if (!course) throw new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.');
		if (actor.role === Role.TEACHER && course.teacherId !== actor.userId) {
			throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage groups for your own courses.');
		}
		return;
	}

	const target = input.scope === MarkerGroupScope.SUBJECT
		? await prisma.subject.findUnique({ where: { id: input.subjectId! }, select: { id: true } })
		: await prisma.institute.findUnique({ where: { id: input.instituteId! }, select: { id: true } });
	if (!target) throw new AppError('MARKER_GROUP_SCOPE_NOT_FOUND', 404, 'The marker group scope target was not found.');
};

const resolveGroupAccess = async (groupId: string, actor: AuthenticatedUser) => {
	assertConfigurator(actor);
	const group = await prisma.markerGroup.findUnique({ where: { id: groupId }, select: groupAccessSelect });
	if (!group || group.deletedAt) throw new AppError('MARKER_GROUP_NOT_FOUND', 404, 'Marker group not found.');
	if (actor.role === Role.TEACHER) {
		if (group.scope !== MarkerGroupScope.COURSE || group.course?.teacherId !== actor.userId) {
			throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage groups for your own courses.');
		}
	}
	return group;
};

export const createMarkerGroup = async (input: CreateMarkerGroupInput, actor: AuthenticatedUser) => {
	await assertScopeTarget(input, actor);
	return prisma.$transaction(async (tx) => {
		const group = await tx.markerGroup.create({
			data: {
				name: input.name,
				description: input.description ?? null,
				scope: input.scope,
				courseId: input.scope === MarkerGroupScope.COURSE ? input.courseId : null,
				subjectId: input.scope === MarkerGroupScope.SUBJECT ? input.subjectId : null,
				instituteId: input.scope === MarkerGroupScope.INSTITUTE ? input.instituteId : null,
				createdById: actor.userId,
			},
			select: groupDetailSelect,
		});
		await writeAuditLog(tx, AUDIT_ACTION.MARKER_GROUP_CREATED, group.id, actor, { scope: input.scope });
		return group;
	});
};

export const listMarkerGroups = async (actor: AuthenticatedUser) => {
	assertConfigurator(actor);
	return prisma.markerGroup.findMany({
		where: actor.role === Role.SUPER_ADMIN
			? { deletedAt: null }
			: { deletedAt: null, scope: MarkerGroupScope.COURSE, course: { teacherId: actor.userId } },
		select: {
			id: true, name: true, description: true, scope: true, isActive: true, revision: true,
			courseId: true, subjectId: true, instituteId: true,
			_count: { select: { members: { where: { removedAt: null } } } },
		},
		orderBy: { name: 'asc' },
	});
};

export const getMarkerGroup = async (groupId: string, actor: AuthenticatedUser) => {
	await resolveGroupAccess(groupId, actor);
	return prisma.markerGroup.findUnique({ where: { id: groupId }, select: groupDetailSelect });
};

export const updateMarkerGroup = async (
	groupId: string,
	input: UpdateMarkerGroupInput,
	actor: AuthenticatedUser,
) => {
	await resolveGroupAccess(groupId, actor);
	return prisma.$transaction(async (tx) => {
		const group = await tx.markerGroup.update({
			where: { id: groupId },
			data: input,
			select: groupDetailSelect,
		});
		await writeAuditLog(tx, AUDIT_ACTION.MARKER_GROUP_UPDATED, groupId, actor, input);
		return group;
	});
};

export const replaceMarkerGroupMembers = async (
	groupId: string,
	input: ReplaceMarkerGroupMembersInput,
	actor: AuthenticatedUser,
) => {
	if (!input.reason.trim()) {
		throw new AppError('MEMBERSHIP_REASON_REQUIRED', 400, 'A reason is required when replacing group members.');
	}
	await resolveGroupAccess(groupId, actor);
	const markerIds = [...new Set(input.markerIds)];

	return prisma.$transaction(async (tx) => {
		// A transaction alone permits two requests to calculate their diffs from
		// the same membership snapshot. This lock is released with the transaction.
		await tx.$executeRaw(
			Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${groupId}, 0))`,
		);
		const markers = await tx.user.findMany({
			where: { id: { in: markerIds }, role: Role.MARKER, deletedAt: null },
			select: markerDirectorySelect,
		});
		if (markers.length !== markerIds.length) {
			throw new AppError('INVALID_MARKER_IDS', 400, 'Some markers are missing, inactive, or not assigned the MARKER role.');
		}

		const currentMembers = await tx.markerGroupMember.findMany({
			where: { groupId, removedAt: null }, select: { markerId: true },
		});
		const currentIds = new Set(currentMembers.map((member) => member.markerId));
		const requestedIds = new Set(markerIds);
		const removedIds = [...currentIds].filter((id) => !requestedIds.has(id));
		const addedIds = markerIds.filter((id) => !currentIds.has(id));
		const now = new Date();

		for (const markerId of removedIds) {
			await tx.markerGroupMember.update({
				where: { groupId_markerId: { groupId, markerId } },
				data: { removedAt: now, removedById: actor.userId },
			});
			await tx.markerGroupMembershipEvent.create({
				data: { groupId, markerId, action: MarkerGroupMembershipAction.REMOVED, actorId: actor.userId, reason: input.reason },
			});
		}

		const removedMembers = addedIds.length === 0 ? [] : await tx.markerGroupMember.findMany({
			where: { groupId, markerId: { in: addedIds }, removedAt: { not: null } }, select: { markerId: true },
		});
		const previouslyRemovedIds = new Set(removedMembers.map((member) => member.markerId));
		for (const markerId of addedIds.filter((id) => previouslyRemovedIds.has(id))) {
				await tx.markerGroupMember.update({
					where: { groupId_markerId: { groupId, markerId } },
					data: { addedAt: now, addedById: actor.userId, removedAt: null, removedById: null },
				});
		}
		const newIds = addedIds.filter((id) => !previouslyRemovedIds.has(id));
		if (newIds.length > 0) {
			await tx.markerGroupMember.createMany({
				data: newIds.map((markerId) => ({ groupId, markerId, addedById: actor.userId })),
			});
		}
		for (const markerId of addedIds) {
			await tx.markerGroupMembershipEvent.create({
				data: { groupId, markerId, action: MarkerGroupMembershipAction.ADDED, actorId: actor.userId, reason: input.reason },
			});
		}

		if (removedIds.length > 0 || addedIds.length > 0) {
			await tx.markerGroup.update({ where: { id: groupId }, data: { revision: { increment: 1 } } });
		}
		await writeAuditLog(tx, AUDIT_ACTION.MARKER_GROUP_MEMBERS_REPLACED, groupId, actor, {
			markerIds: markers.map((marker) => marker.id), reason: input.reason,
		});
		return markers;
	});
};

export const listMarkerGroupHistory = async (groupId: string, actor: AuthenticatedUser) => {
	await resolveGroupAccess(groupId, actor);
	return prisma.markerGroupMembershipEvent.findMany({
		where: { groupId },
		select: {
			id: true, action: true, reason: true, createdAt: true,
			marker: { select: markerDirectorySelect },
			actor: { select: markerDirectorySelect },
		},
		orderBy: { createdAt: 'desc' },
	});
};
