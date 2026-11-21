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
  listPaymentAdjustments: vi.fn(),
  refundPayment: vi.fn(),
  bulkUploadPayments: vi.fn(),
}));

vi.mock('@/controllers/outstanding.controller', () => ({
  listOutstanding: vi.fn(),
  exportOutstanding: vi.fn(),
  sendFeeReminders: vi.fn(),
}));

vi.mock('@/controllers/cash.controller', () => ({
  listCash: vi.fn(),
  listCashTallies: vi.fn(),
  closeCashDay: vi.fn(),
  reconcileCashTally: vi.fn(),
}));

import { paymentRoutes } from './payment.routes';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import * as PaymentController from '@/controllers/payment.controller';
import * as OutstandingController from '@/controllers/outstanding.controller';
import * as CashController from '@/controllers/cash.controller';

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

// Express keeps its route stack private, so expose only the shape this wiring test needs.
function handlesFor(router: unknown, method: string, path: string): unknown[] {
  const stack = (router as { stack: RouterLayer[] }).stack;
  const layer = stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method],
  );
  if (!layer) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  return layer.route!.stack.map((entry) => entry.handle);
}

describe('payment routes — idempotency wiring', () => {
  it('POST /:id/refunds runs checkIdempotency immediately before the controller', () => {
    const stack = handlesFor(paymentRoutes, 'post', '/:id/refunds');
    expect(stack.indexOf(checkIdempotency)).toBe(stack.indexOf(PaymentController.refundPayment) - 1);
  });

  it('PATCH /:id/override carries checkIdempotency', () => {
    expect(handlesFor(paymentRoutes, 'patch', '/:id/override')).toContain(checkIdempotency);
  });

  it('PATCH /:id/override runs checkIdempotency immediately before the controller', () => {
    const stack = handlesFor(paymentRoutes, 'patch', '/:id/override');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(PaymentController.overridePayment);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    // Stack is: verifyToken, requireRole, validateParams, validateBody, checkIdempotency, controller.
    // Pin checkIdempotency to the entry immediately before the controller.
    expect(idempotencyIndex).toBe(controllerIndex - 1);
  });

  it('POST /bulk-upload carries checkIdempotency', () => {
    expect(handlesFor(paymentRoutes, 'post', '/bulk-upload')).toContain(checkIdempotency);
  });

  it('POST /bulk-upload runs checkIdempotency before multer (not merely before the controller)', () => {
    const stack = handlesFor(paymentRoutes, 'post', '/bulk-upload');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(PaymentController.bulkUploadPayments);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    // The stack is: verifyToken, requireRole(...), checkIdempotency, upload.single('file'), controller.
    // Multer's handler isn't independently importable, so pin checkIdempotency two slots
    // before the controller (multer is between idempotency and controller) — this fails if
    // checkIdempotency and multer are swapped.
    expect(idempotencyIndex).toBe(controllerIndex - 2);
  });
});

describe('payment routes — who owes wiring', () => {
  const order = (method: string, path: string) =>
    (paymentRoutes as unknown as { stack: RouterLayer[] }).stack.findIndex((l) => l.route?.path === path && l.route.methods[method]);

  it('registers the outstanding routes before /:id so they are not read as an id', () => {
    const byId = order('get', '/:id');
    expect(order('get', '/outstanding')).toBeGreaterThanOrEqual(0);
    expect(order('get', '/outstanding')).toBeLessThan(byId);
    expect(order('get', '/outstanding/export')).toBeLessThan(byId);
    expect(order('post', '/outstanding/reminders')).toBeGreaterThanOrEqual(0);
  });

  it('POST /outstanding/reminders runs checkIdempotency immediately before the controller', () => {
    const stack = handlesFor(paymentRoutes, 'post', '/outstanding/reminders');
    expect(stack.indexOf(checkIdempotency)).toBe(stack.indexOf(OutstandingController.sendFeeReminders) - 1);
  });
});

describe('payment routes — cash tally wiring', () => {
  const order = (method: string, path: string) =>
    (paymentRoutes as unknown as { stack: RouterLayer[] }).stack.findIndex((l) => l.route?.path === path && l.route.methods[method]);

  it('registers every cash route before /:id so none is read as an id', () => {
    const byId = order('get', '/:id');
    for (const [method, path] of [['get', '/cash'], ['get', '/cash-tally'], ['post', '/cash-tally'], ['patch', '/cash-tally/:id/reconcile']] as const) {
      expect(order(method, path), `${method} ${path}`).toBeGreaterThanOrEqual(0);
      expect(order(method, path), `${method} ${path}`).toBeLessThan(byId);
    }
  });

  it('wires each route to its controller', () => {
    expect(handlesFor(paymentRoutes, 'get', '/cash')).toContain(CashController.listCash);
    expect(handlesFor(paymentRoutes, 'get', '/cash-tally')).toContain(CashController.listCashTallies);
    expect(handlesFor(paymentRoutes, 'post', '/cash-tally')).toContain(CashController.closeCashDay);
    expect(handlesFor(paymentRoutes, 'patch', '/cash-tally/:id/reconcile')).toContain(CashController.reconcileCashTally);
  });
});
