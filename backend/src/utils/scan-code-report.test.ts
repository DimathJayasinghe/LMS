import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
	COLLISION_REPORT_SQL,
	RESERVED_FORMAT_REPORT_SQL,
	NON_ASCII_REPORT_SQL,
	assertOutsideRepository,
	reportToCsv,
	summarizeReport,
	type ReportRow,
} from './scan-code-report';

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
	reason: 'COLLISION',
	code: 'NUG-001',
	holderCount: 2,
	kind: 'INSTITUTE_CARD',
	instituteCode: 'NUG',
	userId: 'u1',
	indexNumber: 7,
	name: 'Nimal Perera',
	role: 'STUDENT',
	deactivated: false,
	...over,
});

describe('report queries', () => {
	it('reports user cards with a reserved code other than their own', () => {
		expect(RESERVED_FORMAT_REPORT_SQL).toContain('USER_BARCODE');
		expect(RESERVED_FORMAT_REPORT_SQL).toMatch(/upper\(u\."barcode"\)\s*<>/i);
		expect(RESERVED_FORMAT_REPORT_SQL).toContain('"indexNumber"');
	});

	it('reports stored non-printable or non-ASCII codes from both tables', () => {
		expect(NON_ASCII_REPORT_SQL).toContain('"User"');
		expect(NON_ASCII_REPORT_SQL).toContain('"StudentBarcode"');
		expect(NON_ASCII_REPORT_SQL).toContain('NON_PRINTABLE_ASCII');
	});

	it('are read-only SELECTs over both code tables', () => {
		for (const sql of [COLLISION_REPORT_SQL, RESERVED_FORMAT_REPORT_SQL]) {
			expect(sql.trim().toUpperCase().startsWith('WITH') || sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
			expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
		}
		expect(COLLISION_REPORT_SQL).toContain('"StudentBarcode"');
		expect(COLLISION_REPORT_SQL).toContain('"User"');
		expect(COLLISION_REPORT_SQL).toMatch(/upper\(/i);
		expect(RESERVED_FORMAT_REPORT_SQL).toContain('^LMS-[0-9]+$');
	});
});

describe('reportToCsv', () => {
	it('writes a header and one line per row', () => {
		const lines = reportToCsv([row(), row({ userId: 'u2', indexNumber: 8 })]).trim().split('\n');
		expect(lines[0]).toBe('reason,code,holderCount,kind,instituteCode,userId,indexNumber,name,role,deactivated');
		expect(lines).toHaveLength(3);
		expect(lines[1]).toBe('COLLISION,NUG-001,2,INSTITUTE_CARD,NUG,u1,7,Nimal Perera,STUDENT,false');
	});

	it('quotes commas, quotes and newlines', () => {
		const csv = reportToCsv([row({ name: 'Perera, "Nimal"\nJr' })]);
		expect(csv).toContain('"Perera, ""Nimal""\nJr"');
	});

	it('neutralises spreadsheet formulas in any text cell', () => {
		const csv = reportToCsv([row({ name: '=HYPERLINK("x")', code: '+1' })]);
		expect(csv).toContain("'=HYPERLINK");
		expect(csv).toContain(",'+1,");
	});

	it('leaves nulls empty', () => {
		const csv = reportToCsv([row({ instituteCode: null, holderCount: null })]);
		expect(csv.trim().split('\n')[1]).toBe('COLLISION,NUG-001,,INSTITUTE_CARD,,u1,7,Nimal Perera,STUDENT,false');
	});
});

describe('summarizeReport', () => {
	it('counts colliding codes, their holders and reserved-format cards', () => {
		const rows = [
			row({ code: 'A', userId: 'u1' }),
			row({ code: 'A', userId: 'u2' }),
			row({ code: 'B', userId: 'u3' }),
			row({ code: 'B', userId: 'u4' }),
			row({ reason: 'RESERVED_FORMAT', code: 'LMS-000009', holderCount: null }),
		];
		expect(summarizeReport(rows)).toEqual({ collidingCodes: 2, collidingHolders: 4, reservedFormatCards: 1, nonPrintableCodes: 0 });
	});

	it('reports zeros for a clean database', () => {
		expect(summarizeReport([])).toEqual({ collidingCodes: 0, collidingHolders: 0, reservedFormatCards: 0, nonPrintableCodes: 0 });
	});
});

describe('assertOutsideRepository', () => {
	const base = mkdtempSync(path.join(tmpdir(), 'scan-report-'));
	const root = path.join(base, 'LMS');
	mkdirSync(root);
	mkdirSync(path.join(root, 'out'));
	const sibling = path.join(base, 'LMS-reports');
	mkdirSync(sibling);
	const link = path.join(base, 'linked');
	symlinkSync(path.join(root, 'missing.csv'), path.join(sibling, 'dangling.csv'));
	symlinkSync(root, link);

	it('refuses a file named ..x.csv inside the repository', () => {
		expect(() => assertOutsideRepository(path.join(root, '..x.csv'), [root])).toThrow(/outside/i);
		expect(() => assertOutsideRepository(path.join(sibling, '..x.csv'), [root])).not.toThrow();
	});

	it('refuses a dangling output symlink', () => {
		expect(() => assertOutsideRepository(path.join(sibling, 'dangling.csv'), [root])).toThrow();
	});

	it('refuses a symlinked parent pointing inside the repository', () => {
		expect(() => assertOutsideRepository(path.join(link, 'report.csv'), [root])).toThrow(/outside/i);
	});

	it('refuses a path inside any root and permits a sibling', () => {
		expect(() => assertOutsideRepository(path.join(root, 'out', 'report.csv'), [root])).toThrow(/outside/i);
		expect(() => assertOutsideRepository(path.join(sibling, 'report.csv'), [root])).not.toThrow();
	});
});
