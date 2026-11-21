import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPaymentMonth } from './payhere';
afterEach(() => vi.useRealTimers());
describe('billing month', () => {
  it('uses the organization timezone at a month boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T18:31:00Z'));
    expect(currentPaymentMonth('Asia/Colombo')).toBe('2026-02');
    expect(currentPaymentMonth('UTC')).toBe('2026-01');
    expect(currentPaymentMonth('Asia/Colombo', new Date('2026-02-28T18:31:00Z'))).toBe('2026-03');
  });
});
