import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { buildIntegrityChecks, tenantOwnedModels } from './tenant-integrity';

const schema = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

describe('tenant registry (ADR 14 M1)', () => {
	const models = Prisma.dmmf.datamodel.models.map((m) => m.name);

	it('every model except Organization is tenant-owned with an organization relation', () => {
		const owned = new Set(tenantOwnedModels(schema));
		const missing = models.filter((name) => name !== 'Organization' && !owned.has(name));
		expect(missing).toEqual([]);
		expect(owned.has('Organization')).toBe(false);

		for (const model of Prisma.dmmf.datamodel.models.filter((m) => m.name !== 'Organization')) {
			const fields = new Map(model.fields.map((f) => [f.name, f.type]));
			expect(fields.get('organizationId'), `${model.name}.organizationId`).toBe('String');
			expect(fields.get('organization'), `${model.name}.organization`).toBe('Organization');
		}
	});

	it('every tenant-owned model restricts deletes and indexes organizationId', () => {
		const blocks = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)];
		for (const [, name, body] of blocks) {
			if (name === 'Organization') continue;
			expect(body, `${name} index`).toMatch(/@@index\(\[organizationId\]\)/);
			expect(body, `${name} relation`).toMatch(
				/organization\s+Organization\??\s+@relation\(fields: \[organizationId\], references: \[id\], onDelete: Restrict\)/,
			);
		}
	});
});

describe('buildIntegrityChecks', () => {
	const fixture = `
model Organization {
  id String @id
}
model Parent {
  id String @id
  organizationId String?
}
model Child {
  id String @id
  parentId String
  parent Parent @relation(fields: [parentId], references: [id])
  organizationId String?
}
model Grant {
  assignmentId String
  examId String
  assignment Child @relation("x", fields: [assignmentId, examId], references: [id, parentId])
  organizationId String?
}
model Loose {
  id String @id
}
`;

	it('creates one query per tenant-to-tenant foreign key, including composite keys', () => {
		const checks = buildIntegrityChecks(fixture);
		expect(checks.map((c) => c.name)).toEqual(['Child.parent -> Parent', 'Grant.assignment -> Child']);
		expect(checks[0]!.sql).toContain('c."parentId" = p."id"');
		expect(checks[1]!.sql).toContain('c."assignmentId" = p."id" AND c."examId" = p."parentId"');
		expect(checks[0]!.sql).toContain('IS DISTINCT FROM');
	});

	it('derives a check for every tenant-to-tenant foreign key in the real schema', () => {
		// Every `fields:` relation except the organization link must yield a check, so a relation line the
		// parser cannot read (for example a future multi-line @relation) fails here instead of being skipped.
		const relations = schema.split('\n').filter((line) => /@relation\(.*fields:/.test(line) && !/organization\s+Organization\??\s+@relation/.test(line));
		const selfOrOwnerless = relations.length - buildIntegrityChecks(schema).length;
		expect(selfOrOwnerless).toBe(0);
	});

	it('derives checks for the real schema', () => {
		const checks = buildIntegrityChecks(schema);
		expect(checks.length).toBeGreaterThan(30);
		expect(checks.map((c) => c.name)).toContain('Payment.enrollment -> Enrollment');
		expect(checks.every((c) => !c.name.endsWith(' -> Organization'))).toBe(true);
	});
});
