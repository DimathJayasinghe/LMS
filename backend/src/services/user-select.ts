import type { Prisma, Role } from '@prisma/client';

/** The account fields that are safe to return: never the password hash, token version or recovery state. */
export interface SafeUser {
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

export const userSelect = {
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
