import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { NIC_IMAGE_KEY_PREFIX, NIC_IMAGE_URL_TTL_SECONDS } from '@/utils/constants';
import { createR2PresignedPutUrl, r2HeadObject } from '@/utils/r2';
import { assertScanCodeFree, resolveStudentByCode } from '@/services/scan-code.service';
import type {
	ListUsersQuery,
	UpdateRoleInput,
	UpdateStatusInput,
	AssignBarcodeInput,
	AcademicStaffQuery,
	NicUploadUrlInput,
	NicConfirmInput,
	CreateStudentBarcodeInput,
} from '@/schemas/user.schema';

interface SafeUser {
	id: string;
	indexNumber: number;
	email: string;
	name: string;
	role: Role;
	phone: string | null;
	nic: string | null;
	address: string | null;
	city: string | null;
	barcode: string | null;
	deletedAt: Date | null;
	createdAt: Date;
}

interface PaginatedResult<T> {
	data: T[];
	count: number;
}

const userSelect = {
	id: true,
	indexNumber: true,
	email: true,
	name: true,
	role: true,
	phone: true,
	nic: true,
	address: true,
	city: true,
	barcode: true,
	deletedAt: true,
	createdAt: true,
} satisfies Prisma.UserSelect;

const buildSearchFilter = (search: string): Prisma.UserWhereInput => {
	const numericValue = Number(search);
	const hasNumber = Number.isFinite(numericValue);

	return {
		OR: [
			{ name: { contains: search, mode: 'insensitive' } },
			{ email: { contains: search, mode: 'insensitive' } },
			{ nic: { contains: search, mode: 'insensitive' } },
			{ barcode: { contains: search, mode: 'insensitive' } },
			...(hasNumber ? [{ indexNumber: numericValue }] : []),
		],
	};
};

const buildStatusFilter = (status: ListUsersQuery['status']): Prisma.UserWhereInput => {
	if (status === 'all') {
		return {};
	}

	return status === 'active'
		? { deletedAt: null }
		: { deletedAt: { not: null } };
};

export const listUsers = async (query: ListUsersQuery): Promise<PaginatedResult<SafeUser>> => {
	const { page, limit, role, status, search } = query;
	const skip = (page - 1) * limit;

	const where: Prisma.UserWhereInput = {
		...(role ? { role } : {}),
		...buildStatusFilter(status),
		...(search ? buildSearchFilter(search) : {}),
	};

	const [data, count] = await Promise.all([
		prisma.user.findMany({
			where,
			select: userSelect,
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit,
		}),
		prisma.user.count({ where }),
	]);

	return { data, count };
};

export const listAcademicStaff = async (
	query: AcademicStaffQuery,
	actorRole: Role,
) => {
	if (actorRole === Role.TEACHER && query.role !== Role.MARKER) {
		throw new AppError('FORBIDDEN', 403, 'Teachers may only access the marker directory.');
	}

	return prisma.user.findMany({
		where: { role: query.role, deletedAt: null },
		select: { id: true, name: true, role: true },
		orderBy: { name: 'asc' },
		take: 100,
	});
};

export const getUserById = async (id: string): Promise<SafeUser> => {
	const user = await prisma.user.findUnique({
		where: { id },
		select: userSelect,
	});

	if (!user) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	return user;
};

// Front-desk (ADMIN) manages day-to-day accounts but must never be able to touch a
// privileged peer/superior account (ADMIN or SUPER_ADMIN) — only SUPER_ADMIN can.
const assertCanManagePrivilegedTarget = (actorRole: Role, targetRole: Role): void => {
	const targetIsPrivileged = targetRole === Role.SUPER_ADMIN || targetRole === Role.ADMIN;

	if (targetIsPrivileged && actorRole !== Role.SUPER_ADMIN) {
		throw new AppError(
			'FORBIDDEN',
			403,
			'Only a super admin can modify an admin or super admin account.',
		);
	}
};

export const updateRole = async (id: string, input: UpdateRoleInput): Promise<SafeUser> => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	return prisma.user.update({
		where: { id },
		data: { role: input.role },
		select: userSelect,
	});
};

export const updateStatus = async (
	id: string,
	input: UpdateStatusInput,
	actorRole: Role,
): Promise<SafeUser> => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	assertCanManagePrivilegedTarget(actorRole, user.role);

	const deletedAt = input.isActive ? null : new Date();

	return prisma.user.update({
		where: { id },
		data: { deletedAt },
		select: userSelect,
	});
};

export const assignBarcode = async (
	id: string,
	input: AssignBarcodeInput,
	actorRole: Role,
): Promise<SafeUser> => {
	return prisma.$transaction(async (tx) => {
		const user = await tx.user.findUnique({ where: { id } });

		if (!user) {
			throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
		}

		assertCanManagePrivilegedTarget(actorRole, user.role);

		// Re-assigning the code the user already holds changes nothing about who owns it.
		if (user.barcode?.toLowerCase() !== input.barcode.toLowerCase()) {
			await assertScanCodeFree(tx, input.barcode, { exceptUserId: id });
		}

		return tx.user.update({
			where: { id },
			data: { barcode: input.barcode },
			select: userSelect,
		});
	});
};

// ─── Account Setup (NIC upload + institute barcodes) ─────────

interface NicUploadUrlResult {
	uploadUrl: string;
	key: string;
	expiresAt: Date;
	/** Reflects the row *after* this write — true once both sides are on file. */
	setupCompleted: boolean;
}

/**
 * Presigns a direct-to-R2 PUT for one NIC photo (front or back). Persists
 * NOTHING — the browser PUT can still fail (a bad connection, an R2 CORS rule
 * that doesn't allow the app origin), and eagerly writing the key here used to
 * mark a photo "uploaded" that never actually landed. The client confirms the
 * upload via `confirmNicUpload` after the PUT succeeds; only then is the key
 * stored and `setupCompleted` flipped. Same "server never touches the file"
 * pattern as exam papers (see context/documents/02-architecture.md §4.1).
 */
export const generateNicUploadUrl = async (
	userId: string,
	input: NicUploadUrlInput,
): Promise<NicUploadUrlResult> => {
	const existing = await prisma.user.findUnique({
		where: { id: userId },
		select: { setupCompleted: true },
	});

	if (!existing) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	const key = `${NIC_IMAGE_KEY_PREFIX}/${userId}/${input.side.toLowerCase()}-${input.fileName}`;
	const uploadUrl = await createR2PresignedPutUrl(key, input.contentType, NIC_IMAGE_URL_TTL_SECONDS);

	return {
		uploadUrl,
		key,
		expiresAt: new Date(Date.now() + NIC_IMAGE_URL_TTL_SECONDS * 1000),
		setupCompleted: existing.setupCompleted,
	};
};

/**
 * Confirms a NIC photo actually reached R2 (HeadObject), then stores the key and
 * flips `setupCompleted` once both sides are on file. Idempotent: re-confirming a
 * present object simply rewrites the same key. The `key` is the one handed out by
 * `generateNicUploadUrl`; we re-validate its prefix belongs to THIS user so a
 * client can't confirm an object it doesn't own.
 */
export const confirmNicUpload = async (
	userId: string,
	input: NicConfirmInput,
): Promise<{ setupCompleted: boolean }> => {
	const expectedPrefix = `${NIC_IMAGE_KEY_PREFIX}/${userId}/${input.side.toLowerCase()}-`;
	if (!input.key.startsWith(expectedPrefix)) {
		throw new AppError('FORBIDDEN_KEY', 403, 'That upload key does not belong to you.');
	}

	const { exists } = await r2HeadObject(input.key);
	if (!exists) {
		throw new AppError(
			'UPLOAD_NOT_FOUND',
			409,
			"We couldn't find the uploaded photo. Please try uploading it again.",
		);
	}

	const existing = await prisma.user.findUnique({
		where: { id: userId },
		select: { nicFrontUrl: true, nicBackUrl: true },
	});
	if (!existing) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	const otherSideKey = input.side === 'FRONT' ? existing.nicBackUrl : existing.nicFrontUrl;
	const setupCompleted = Boolean(otherSideKey);

	const updated = await prisma.user.update({
		where: { id: userId },
		data: {
			...(input.side === 'FRONT' ? { nicFrontUrl: input.key } : { nicBackUrl: input.key }),
			...(setupCompleted ? { setupCompleted: true } : {}),
		},
		select: { setupCompleted: true },
	});

	return { setupCompleted: updated.setupCompleted };
};

interface StudentBarcodeSummary {
	id: string;
	barcode: string;
	instituteId: string;
	institute: { id: string; name: string; code: string; city: string | null };
	createdAt: Date;
	updatedAt: Date;
}

const studentBarcodeSelect = {
	id: true,
	barcode: true,
	instituteId: true,
	institute: { select: { id: true, name: true, code: true, city: true } },
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.StudentBarcodeSelect;

/** A student's own per-institute barcodes (see StudentBarcode's per-institute uniqueness). */
export const listMyInstituteBarcodes = async (userId: string): Promise<StudentBarcodeSummary[]> => {
	return prisma.studentBarcode.findMany({
		where: { userId },
		select: studentBarcodeSelect,
		orderBy: { createdAt: 'asc' },
	});
};

export const createMyInstituteBarcode = async (
	userId: string,
	input: CreateStudentBarcodeInput,
): Promise<StudentBarcodeSummary> => {
	return prisma.$transaction(async (tx) => {
		const institute = await tx.institute.findUnique({ where: { id: input.instituteId } });

		if (!institute || !institute.isActive) {
			throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Institute not found.');
		}

		const ownExisting = await tx.studentBarcode.findUnique({
			where: { userId_instituteId: { userId, instituteId: input.instituteId } },
		});

		if (ownExisting) {
			throw new AppError(
				'STUDENT_BARCODE_EXISTS',
				409,
				'You already registered a barcode for this institute. Remove it first to change it.',
			);
		}

		// A code must identify one student across both code kinds and every institute.
		await assertScanCodeFree(tx, input.barcode, { exceptUserId: userId });

		return tx.studentBarcode.create({
			data: { userId, instituteId: input.instituteId, barcode: input.barcode },
			select: studentBarcodeSelect,
		});
	});
};

export const deleteMyInstituteBarcode = async (userId: string, barcodeId: string): Promise<void> => {
	const existing = await prisma.studentBarcode.findUnique({ where: { id: barcodeId } });

	if (!existing || existing.userId !== userId) {
		throw new AppError('STUDENT_BARCODE_NOT_FOUND', 404, 'Institute barcode not found.');
	}

	await prisma.studentBarcode.delete({ where: { id: barcodeId } });
};

interface ResolvedBarcodeStudent {
	user: { id: string; name: string; indexNumber: number };
	instituteId: string | null;
	matchedBarcode: string;
}

/**
 * Resolves a scanned code to a student for the front desk's payment lookup, through the same
 * resolver as the entrance scanner: a code held by several students is refused (`AMBIGUOUS_CODE`),
 * never guessed, and the desk searches by index number or name instead.
 */
export const resolveStudentByBarcode = async (code: string): Promise<ResolvedBarcodeStudent> => {
	const { student, instituteId, matchedBarcode } = await resolveStudentByCode(code);

	return {
		user: { id: student.id, name: student.name, indexNumber: student.indexNumber },
		instituteId,
		matchedBarcode,
	};
};
