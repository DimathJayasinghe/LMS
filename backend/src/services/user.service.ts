import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { ListUsersQuery, UpdateRoleInput, UpdateStatusInput, AssignBarcodeInput } from '@/schemas/user.schema';

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
): Promise<SafeUser> => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

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
): Promise<SafeUser> => {
	const user = await prisma.user.findUnique({ where: { id } });

	if (!user) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	const existing = await prisma.user.findUnique({ where: { barcode: input.barcode } });

	if (existing && existing.id !== id) {
		throw new AppError('BARCODE_IN_USE', 409, 'This barcode is already assigned.');
	}

	return prisma.user.update({
		where: { id },
		data: { barcode: input.barcode },
		select: userSelect,
	});
};
