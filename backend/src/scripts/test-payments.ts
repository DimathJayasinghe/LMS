/**
 * Payment System — End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-payments.ts
 * The server must be running on port 5000.
 */

import * as dotenv from 'dotenv';
import crypto from 'crypto';
import { prisma } from '../config/database';

dotenv.config();

const BASE = process.env.API_URL || 'http://localhost:80/api';
const ADMIN_EMAIL = process.env.LMS_ADMIN_EMAIL || 'admin@lms.com';
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD || 'adminpassword123';
const MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || 'test_secret';

// ─── Helpers ─────────────────────────────────────────────────

interface CookieJar {
  values: Map<string, string>;
}

const cookieHeader = (jar: CookieJar): string =>
  Array.from(jar.values.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const extractCookies = (headers: Headers, jar: CookieJar): void => {
  const getSetCookie = (headers as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies =
    getSetCookie?.call(headers) ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);

  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      jar.values.set(name, value);
    }
  }
};

let passed = 0;
let failed = 0;

const assert = (label: string, condition: boolean, detail?: unknown): void => {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`, detail ?? '');
    failed++;
  }
};

async function request(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  jar: CookieJar,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jar.values.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  extractCookies(res.headers, jar);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const md5 = (input: string): string => {
  return crypto.createHash('md5').update(input).digest('hex');
};

const generatePayhereSignature = (
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  statusCode: number,
  secret: string
): string => {
  const hashedSecret = md5(secret).toUpperCase();
  const raw = `${merchantId}${orderId}${amount}${currency}${statusCode}${hashedSecret}`;
  return md5(raw).toUpperCase();
};

// ─── Setup ───────────────────────────────────────────────────

const ts = Date.now();
const studentEmail = `pay.student.${ts}@test.com`;
const password = 'Password123';
const paymentMonth = '2026-05';

let studentId = '';
let courseId = '';
let enrollmentId = '';

const adminJar: CookieJar = { values: new Map() };
const studentJar: CookieJar = { values: new Map() };

async function setup() {
  console.log('── Setting up test data ──');

  // 1. Login Admin
  const adminRes = await request('POST', '/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  }, adminJar);
  
  if (adminRes.status !== 200) {
    console.error('\n❌ Failed to log in as Admin. Ensure LMS_ADMIN_EMAIL and LMS_ADMIN_PASSWORD are set.');
    process.exit(1);
  }

  // 2. Register Student
  const studentRes = await request('POST', '/auth/register', {
    email: studentEmail,
    name: 'Payment Test Student',
    password,
    phone: '0771234567',
  }, studentJar);
  assert('Student registered', studentRes.status === 201);
  studentId = (studentRes.data as any)?.data?.id;

  // 3. Create Course
  const courseRes = await request('POST', '/classes', {
    name: `Payment Test Course ${ts}`,
    year: 2026,
    monthlyFee: 2500,
  }, adminJar);
  assert('Course created', courseRes.status === 201);
  courseId = (courseRes.data as any).data.id;

  // 4. Manually create enrollment via Prisma (since no API endpoint found)
  console.log('   Creating enrollment via Prisma...');
  const enrollment = await prisma.enrollment.create({
    data: {
      userId: studentId,
      courseId: courseId,
      classType: 'ONLINE',
      isActive: true,
    }
  });
  enrollmentId = enrollment.id;
  assert('Enrollment created in DB', Boolean(enrollmentId));

  console.log('Setup complete.\n');
}

// ─── Main Test Logic ─────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log('\n🔵 Payment System — Smoke Tests\n');
  await setup();

  try {
    console.log('── Testing Payment Initiation ──');

    // 1. Student initiates payment
    const initRes = await request('POST', '/payments/initiate', {
      enrollmentId,
      paymentMonth,
    }, studentJar);

    assert('POST /initiate -> 200 OK', initRes.status === 200, initRes.data);
    const initData = (initRes.data as any)?.data;
    assert('Initiate returns checkoutUrl', Boolean(initData?.checkoutUrl));
    assert('Initiate returns PayHere payload', Boolean(initData?.payload?.hash));
    
    const paymentId = initData?.payment?.id;
    assert('Payment object created', Boolean(paymentId));

    console.log('\n── Testing PayHere Webhook ──');

    // 2. Simulate PayHere Notification
    const merchantId = initData.payload.merchant_id;
    const amount = initData.payload.amount; // Should be "2500.00"
    const currency = initData.payload.currency;
    const statusCode = 2; // Success
    
    const md5sig = generatePayhereSignature(
      merchantId,
      paymentId,
      amount,
      currency,
      statusCode,
      MERCHANT_SECRET
    );

    const notifyRes = await request('POST', '/payments/payhere/notify', {
      merchant_id: merchantId,
      order_id: paymentId,
      payment_id: `PAYHERE-${ts}`,
      payhere_amount: amount,
      payhere_currency: currency,
      status_code: statusCode,
      md5sig: md5sig,
    }, { values: new Map() });

    assert('POST /payhere/notify -> 200 OK', notifyRes.status === 200, notifyRes.data);

    console.log('\n── Verifying Status ──');

    // 3. Check status as student
    const statusRes = await request('GET', `/payments/payhere/status/${paymentId}`, undefined, studentJar);
    assert('GET /payhere/status/:id -> 200 OK', statusRes.status === 200);
    assert('Status is SUCCESS', (statusRes.data as any)?.data?.status === 'SUCCESS');

    // 4. List my payments
    const myRes = await request('GET', '/payments/my', undefined, studentJar);
    assert('GET /my -> 200 OK', myRes.status === 200);
    assert('My payments count > 0', (myRes.data as any)?.count > 0);

    console.log('\n── Admin Operations ──');

    // 5. List all payments as admin
    const allRes = await request('GET', `/payments?userId=${studentId}`, undefined, adminJar);
    assert('GET / (admin) -> 200 OK', allRes.status === 200);
    assert('Admin can see the student payment', (allRes.data as any)?.count > 0);

    // 6. Override payment
    const overrideRes = await request('PATCH', `/payments/${paymentId}/override`, {
      status: 'SUCCESS',
      amount: 2000,
      note: 'Partial payment override test'
    }, adminJar);
    assert('PATCH /override (admin) -> 200 OK', overrideRes.status === 200);
    assert('Amount updated via override', (overrideRes.data as any)?.data?.amount === '2000');

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${'-'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
