import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
	COLLISION_REPORT_SQL,
	RESERVED_FORMAT_REPORT_SQL,
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
		expect(summarizeReport(rows)).toEqual({ collidingCodes: 2, collidingHolders: 4, reservedFormatCards: 1 });
	});

	it('reports zeros for a clean database', () => {
		expect(summarizeReport([])).toEqual({ collidingCodes: 0, collidingHolders: 0, reservedFormatCards: 0 });
	});
});

describe('assertOutsideRepository', () => {
	const root = path.resolve('/work/LMS');

	it('refuses a path inside the checkout, however it is spelled', () => {
		expect(() => assertOutsideRepository('/work/LMS/report.csv', [root])).toThrow(/outside/i);
		expect(() => assertOutsideRepository('/work/LMS/backend/../out/report.csv', [root])).toThrow(/outside/i);
		expect(() => assertOutsideRepository('/work/LMS', [root])).toThrow(/outside/i);
	});

	it('refuses a path inside any of several roots', () => {
		expect(() => assertOutsideRepository('/app/out.csv', [root, '/app'])).toThrow(/outside/i);
	});

	it('accepts a path elsewhere, including a sibling directory with a similar name', () => {
		expect(() => assertOutsideRepository('/tmp/report.csv', [root])).not.toThrow();
		expect(() => assertOutsideRepository('/work/LMS-reports/report.csv', [root])).not.toThrow();
	});
});
