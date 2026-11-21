import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';

const { generateStreamUrl, auditLog } = vi.hoisted(() => ({
	generateStreamUrl: vi.fn(),
	auditLog: vi.fn(),
}));

vi.mock('@/services/video.service', () => ({ generateStreamUrl }));
vi.mock('@/services/audit.service', () => ({ log: auditLog }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/utils/bunny', () => ({ verifyBunnyWebhookSignature: vi.fn() }));

import { getStreamUrl } from './video.controller';

const VIDEO_ID = '3f2b8c4e-1a5d-4e6f-8a9b-0c1d2e3f4a5b';

const streamResult = {
	video: { id: VIDEO_ID, title: 'Lecture 1', durationSeconds: 600 },
	embedUrl: 'https://iframe.example/embed?token=x',
	watermark: 'Nimal · #42',
	expiresAt: 123,
};

const call = async (role: Role) => {
	const req = {
		params: { id: VIDEO_ID },
		user: { userId: 'u-1', role },
		ip: '10.0.0.1',
		socket: { remoteAddress: '10.0.0.1' },
		get: () => 'jest-agent',
	} as unknown as Request;
	const json = vi.fn();
	const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
	const next = vi.fn();
	getStreamUrl(req, res, next);
	await vi.waitFor(() => expect(json.mock.calls.length + next.mock.calls.length).toBeGreaterThan(0));
	return { json, next };
};

beforeEach(() => {
	vi.clearAllMocks();
	generateStreamUrl.mockResolvedValue(streamResult);
});

describe('getStreamUrl: audit of staff stream opens', () => {
	it.each([Role.TEACHER, Role.SUPER_ADMIN])('writes an audit row when a %s opens a recording', async (role) => {
		await call(role);

		expect(auditLog).toHaveBeenCalledTimes(1);
		expect(auditLog.mock.calls[0]![0]).toMatchObject({
			action: 'RECORDING_STREAM_STAFF',
			targetType: 'VideoRecording',
			targetId: VIDEO_ID,
			context: { actorId: 'u-1', actorRole: role },
		});
	});

	it('does not write an audit row for a student', async () => {
		await call(Role.STUDENT);
		expect(auditLog).not.toHaveBeenCalled();
	});

	it('writes no audit row when the stream is refused', async () => {
		generateStreamUrl.mockRejectedValue(new Error('refused'));
		const { next } = await call(Role.TEACHER);
		expect(next).toHaveBeenCalled();
		expect(auditLog).not.toHaveBeenCalled();
	});

	it('the audit row carries no signed URL', async () => {
		await call(Role.SUPER_ADMIN);
		expect(JSON.stringify(auditLog.mock.calls[0]![0])).not.toContain('token=');
	});

	it('still returns the signed embed URL to the caller', async () => {
		const { json } = await call(Role.TEACHER);
		expect(json.mock.calls[0]![0].data.embedUrl).toContain('token=x');
	});
});
