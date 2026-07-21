import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/config/redis', () => ({ redis: {} }));
vi.mock('@/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/controllers/payment.controller', () => ({
  initiatePayherePayment: vi.fn(),
  collectEntrancePayment: vi.fn(),
  handlePayhereNotify: vi.fn(),
  getPayhereStatus: vi.fn(),
  listPayments: vi.fn(),
  listMyPayments: vi.fn(),
  getPaymentsSummary: vi.fn(),
  getFinancialReport: vi.fn(),
  getPaymentById: vi.fn(),
  overridePayment: vi.fn(),
  bulkUploadPayments: vi.fn(),
}));

import { paymentRoutes } from './payment.routes';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import * as PaymentController from '@/controllers/payment.controller';

// Returns the ordered handler stack registered for a given method+path on a router.
function handlesFor(router: any, method: string, path: string): unknown[] {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

describe('payment routes — idempotency wiring', () => {
  it('PATCH /:id/override carries checkIdempotency', () => {
    expect(handlesFor(paymentRoutes, 'patch', '/:id/override')).toContain(checkIdempotency);
  });

  it('PATCH /:id/override runs checkIdempotency before the controller', () => {
    const stack = handlesFor(paymentRoutes, 'patch', '/:id/override');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(PaymentController.overridePayment);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    expect(idempotencyIndex).toBeLessThan(controllerIndex);
  });

  it('POST /bulk-upload carries checkIdempotency', () => {
    expect(handlesFor(paymentRoutes, 'post', '/bulk-upload')).toContain(checkIdempotency);
  });

  it('POST /bulk-upload runs checkIdempotency before the controller (and thus before multer)', () => {
    const stack = handlesFor(paymentRoutes, 'post', '/bulk-upload');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(PaymentController.bulkUploadPayments);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    expect(idempotencyIndex).toBeLessThan(controllerIndex);
  });
});
