import { describe, it, expect } from 'vitest';
import { findLocalDrivers } from './drivers';

describe('findLocalDrivers', () => {
	it('returns nothing when every driver is the real provider', () => {
		expect(findLocalDrivers({ STORAGE_DRIVER: 'r2', SMS_DRIVER: 'notify' })).toEqual([]);
	});

	it('lists each local or mock driver by variable and value', () => {
		expect(findLocalDrivers({ STORAGE_DRIVER: 'local', SMS_DRIVER: 'notify' })).toEqual(['STORAGE_DRIVER=local']);
		expect(findLocalDrivers({ STORAGE_DRIVER: 'local', SMS_DRIVER: 'log' })).toEqual([
			'STORAGE_DRIVER=local',
			'SMS_DRIVER=log',
		]);
	});
});
