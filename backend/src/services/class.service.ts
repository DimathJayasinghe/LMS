import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type {
	CreateClassInput,
	ListClassesQuery,
	UpdateClassInput,
} from '@/schemas/class.schema';

interface ClassSummary {
	id: string;
	name: string;
	year: number;
	description: string | null;
	monthlyFee: Prisma.Decimal;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

const classSelect = {
	id: true,
	name: true,
	year: true,
	description: true,
	monthlyFee: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.CourseSelect;

const buildSearchFilter = (search: string): Prisma.CourseWhereInput => {
	return {
		OR: [
			{ name: { contains: search, mode: 'insensitive' } },
			{ description: { contains: search, mode: 'insensitive' } },
		],
	};
};

export const createClass = async (input: CreateClassInput): Promise<ClassSummary> => {
	const existing = await prisma.course.findUnique({
		where: {
			name_year: {
				name: input.name,
				year: input.year,
			},
		},
	});

	if (existing) {
		throw new AppError(
			'CLASS_ALREADY_EXISTS',
			409,
			'A class with this name and year already exists.',
		);
	}

	return prisma.course.create({
		data: {
			name: input.name,
			year: input.year,
			description: input.description ?? null,
			monthlyFee: input.monthlyFee,
			isActive: input.isActive ?? true,
		},
		select: classSelect,
	});
};

export const listClasses = async (
	query: ListClassesQuery,
	role: Role,
): Promise<ClassSummary[]> => {
	const where: Prisma.CourseWhereInput = {
		...(query.search ? buildSearchFilter(query.search) : {}),
		...(query.year ? { year: query.year } : {}),
		...(role === Role.ADMIN ? {} : { isActive: true }),
	};

	return prisma.course.findMany({
		where,
		select: classSelect,
		orderBy: { year: 'desc' },
	});
};

export const getClassById = async (
	classId: string,
	role: Role,
): Promise<ClassSummary> => {
	const where: Prisma.CourseWhereInput = {
		id: classId,
		...(role === Role.ADMIN ? {} : { isActive: true }),
	};

	const course = await prisma.course.findFirst({
		where,
		select: classSelect,
	});

	if (!course) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	}

	return course;
};

export const updateClass = async (
	classId: string,
	input: UpdateClassInput,
): Promise<ClassSummary> => {
	const existing = await prisma.course.findUnique({
		where: { id: classId },
	});

	if (!existing) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	}

	const nextName = input.name ?? existing.name;
	const nextYear = input.year ?? existing.year;

	const duplicate = await prisma.course.findUnique({
		where: {
			name_year: {
				name: nextName,
				year: nextYear,
			},
		},
	});

	if (duplicate && duplicate.id !== classId) {
		throw new AppError(
			'CLASS_ALREADY_EXISTS',
			409,
			'A class with this name and year already exists.',
		);
	}

	return prisma.course.update({
		where: { id: classId },
		data: {
			name: input.name,
			year: input.year,
			description: input.description ?? undefined,
			monthlyFee: input.monthlyFee,
			isActive: input.isActive,
		},
		select: classSelect,
	});
};
