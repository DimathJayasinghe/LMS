export {};

/**
 * Seeds realistic demo content: teachers, subjects, courses, a weekly
 * timetable, generated upcoming sessions, a couple of enrolled+paid
 * students, and one exam per course. Idempotent (upsert / find-before-create
 * throughout) — safe to re-run. Does not touch or delete existing rows.
 *
 * Run: DATABASE_URL=... npx tsx src/scripts/seed-demo.ts
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, ClassType, PaymentStatus, PaymentMethod, ExamType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const COLOMBO_UTC_OFFSET_MIN = 5.5 * 60;

/** Colombo-local weekday (0-6) of a UTC instant — mirrors timetable.service.ts. */
const colomboWeekday = (utcMillis: number): number =>
  new Date(utcMillis + COLOMBO_UTC_OFFSET_MIN * 60_000).getUTCDay();

/** All UTC datetimes in [from,to] on `dayOfWeek` at `startTime` (Colombo local). */
const occurrences = (from: Date, to: Date, dayOfWeek: number, startTime: string): Date[] => {
  const [hh, mm] = startTime.split(':').map(Number) as [number, number];
  const result: Date[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const d = cursor.getUTCDate();
    const utcMillis = Date.UTC(y, m, d, hh, mm) - COLOMBO_UTC_OFFSET_MIN * 60_000;
    if (colomboWeekday(utcMillis) === dayOfWeek) {
      const when = new Date(utcMillis);
      if (when >= from && when <= to) result.push(when);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
};

interface TeacherSeed {
  email: string;
  name: string;
}

interface CourseSeed {
  courseName: string;
  year: number;
  description: string;
  monthlyFee: number;
  subjectName: string;
  teacherEmail: string;
  slots: { dayOfWeek: number; startTime: string; durationMinutes: number; classType: ClassType }[];
}

const TEACHERS: TeacherSeed[] = [
  { email: 'k.perera@lms.demo', name: 'Ms. K. Perera' },
  { email: 's.fernando@lms.demo', name: 'Mr. S. Fernando' },
  { email: 'n.silva@lms.demo', name: 'Mrs. N. Silva' },
  { email: 'r.jayasuriya@lms.demo', name: 'Mr. R. Jayasuriya' },
  { email: 'd.wickramasinghe@lms.demo', name: 'Ms. D. Wickramasinghe' },
];

const SUBJECTS = ['Physics', 'Chemistry', 'Combined Maths', 'Biology', 'ICT'];

const COURSES: CourseSeed[] = [
  {
    courseName: '2027 A/L Physics Theory',
    year: 2027,
    description: 'Full syllabus coverage for the 2027 A/L Physics exam, theory + revision.',
    monthlyFee: 3500,
    subjectName: 'Physics',
    teacherEmail: 'k.perera@lms.demo',
    slots: [
      { dayOfWeek: 1, startTime: '16:00', durationMinutes: 120, classType: ClassType.PHYSICAL },
      { dayOfWeek: 6, startTime: '14:00', durationMinutes: 90, classType: ClassType.ONLINE },
    ],
  },
  {
    courseName: '2027 A/L Chemistry Theory',
    year: 2027,
    description: 'Organic, inorganic, and physical chemistry for the 2027 A/L exam.',
    monthlyFee: 3500,
    subjectName: 'Chemistry',
    teacherEmail: 's.fernando@lms.demo',
    slots: [{ dayOfWeek: 2, startTime: '16:00', durationMinutes: 120, classType: ClassType.PHYSICAL }],
  },
  {
    courseName: '2027 A/L Combined Maths Theory',
    year: 2027,
    description: 'Pure and applied maths, taught live online with weekly problem sets.',
    monthlyFee: 4000,
    subjectName: 'Combined Maths',
    teacherEmail: 'n.silva@lms.demo',
    slots: [{ dayOfWeek: 3, startTime: '15:00', durationMinutes: 150, classType: ClassType.ONLINE }],
  },
  {
    courseName: '2026 A/L Biology Theory',
    year: 2026,
    description: 'Final-year revision and past-paper practice for the 2026 A/L exam.',
    monthlyFee: 3000,
    subjectName: 'Biology',
    teacherEmail: 'r.jayasuriya@lms.demo',
    slots: [{ dayOfWeek: 4, startTime: '16:00', durationMinutes: 120, classType: ClassType.PHYSICAL }],
  },
  {
    courseName: '2027 A/L ICT Practical',
    year: 2027,
    description: 'Hands-on ICT practicals every Saturday morning.',
    monthlyFee: 2500,
    subjectName: 'ICT',
    teacherEmail: 'd.wickramasinghe@lms.demo',
    slots: [{ dayOfWeek: 6, startTime: '09:00', durationMinutes: 180, classType: ClassType.PHYSICAL }],
  },
];

const STUDENTS = [
  { email: 'a.rathnayake@lms.demo', name: 'A. Rathnayake' },
  { email: 'b.gunasekara@lms.demo', name: 'B. Gunasekara' },
];

const main = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const passwordHash = await bcrypt.hash('Demo@12345', 10);

  try {
    // ── Subjects ──────────────────────────────────────────────
    const subjectByName = new Map<string, string>();
    for (const name of SUBJECTS) {
      const subject = await prisma.subject.upsert({
        where: { name },
        update: {},
        create: { name, isActive: true },
        select: { id: true },
      });
      subjectByName.set(name, subject.id);
    }

    // ── Teachers ──────────────────────────────────────────────
    const teacherIdByEmail = new Map<string, string>();
    for (const t of TEACHERS) {
      const user = await prisma.user.upsert({
        where: { email: t.email },
        update: { role: 'TEACHER', name: t.name, deletedAt: null },
        create: {
          email: t.email,
          name: t.name,
          password: passwordHash,
          role: 'TEACHER',
          setupCompleted: true,
        },
        select: { id: true },
      });
      teacherIdByEmail.set(t.email, user.id);
    }

    // ── Students ──────────────────────────────────────────────
    const studentIds: string[] = [];
    for (const s of STUDENTS) {
      const existing = await prisma.user.findUnique({ where: { email: s.email }, select: { id: true } });
      const user =
        existing ??
        (await prisma.user.create({
          data: {
            email: s.email,
            name: s.name,
            password: passwordHash,
            role: 'STUDENT',
            setupCompleted: true,
          },
          select: { id: true },
        }));
      studentIds.push(user.id);
    }

    // ── Courses + Timetable + Sessions ───────────────────────
    const now = new Date();
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    let sessionsCreated = 0;

    for (const c of COURSES) {
      const subjectId = subjectByName.get(c.subjectName)!;
      const teacherId = teacherIdByEmail.get(c.teacherEmail)!;

      const course = await prisma.course.upsert({
        where: { subjectId_name_year: { subjectId, name: c.courseName, year: c.year } },
        update: { description: c.description, monthlyFee: c.monthlyFee, isActive: true },
        create: {
          name: c.courseName,
          year: c.year,
          description: c.description,
          monthlyFee: c.monthlyFee,
          isActive: true,
          subjectId,
          teacherId,
        },
        select: { id: true },
      });

      for (const slotDef of c.slots) {
        let slot = await prisma.timetableSlot.findFirst({
          where: { courseId: course.id, dayOfWeek: slotDef.dayOfWeek, startTime: slotDef.startTime },
          select: { id: true, dayOfWeek: true, startTime: true, durationMinutes: true, classType: true },
        });
        if (!slot) {
          slot = await prisma.timetableSlot.create({
            data: {
              courseId: course.id,
              title: null,
              dayOfWeek: slotDef.dayOfWeek,
              startTime: slotDef.startTime,
              durationMinutes: slotDef.durationMinutes,
              classType: slotDef.classType,
              isActive: true,
            },
            select: { id: true, dayOfWeek: true, startTime: true, durationMinutes: true, classType: true },
          });
        }

        for (const date of occurrences(now, twoWeeksOut, slot.dayOfWeek, slot.startTime)) {
          const existingSession = await prisma.classSession.findUnique({
            where: { timetableSlotId_date: { timetableSlotId: slot.id, date } },
            select: { id: true },
          });
          if (existingSession) continue;

          await prisma.classSession.create({
            data: {
              title: `${c.courseName} — Session`,
              classType: slot.classType,
              date,
              durationMinutes: slot.durationMinutes,
              courseId: course.id,
              timetableSlotId: slot.id,
            },
          });
          sessionsCreated += 1;
        }
      }

      // One exam per course, scheduled a week out, unpublished (matches how
      // a real teacher would leave it until results day).
      const examExists = await prisma.exam.findFirst({
        where: { courseId: course.id, title: `${c.courseName} — Term Test` },
        select: { id: true },
      });
      if (!examExists) {
        const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await prisma.exam.create({
          data: {
            title: `${c.courseName} — Term Test`,
            type: ExamType.HYBRID,
            startTime: start,
            endTime: new Date(start.getTime() + 2 * 60 * 60 * 1000),
            totalMarks: 100,
            isPublished: false,
            courseId: course.id,
          },
        });
      }

      // Enroll both demo students, one paid, one pending — realistic mix.
      for (const [i, studentId] of studentIds.entries()) {
        const enrollment = await prisma.enrollment.upsert({
          where: {
            userId_courseId_classType: {
              userId: studentId,
              courseId: course.id,
              classType: c.slots[0]!.classType,
            },
          },
          update: { isActive: true },
          create: {
            userId: studentId,
            courseId: course.id,
            classType: c.slots[0]!.classType,
            isActive: true,
          },
          select: { id: true },
        });

        if (i === 0) {
          const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
          await prisma.payment.upsert({
            where: { enrollmentId_paymentMonth: { enrollmentId: enrollment.id, paymentMonth: month } },
            update: {},
            create: {
              enrollmentId: enrollment.id,
              amount: c.monthlyFee,
              status: PaymentStatus.SUCCESS,
              method: PaymentMethod.ONLINE,
              paymentMonth: month,
            },
          });
        }
      }
    }

    console.log(
      `Seeded demo data: ${SUBJECTS.length} subjects, ${TEACHERS.length} teachers, ${COURSES.length} courses, ${sessionsCreated} new sessions, ${STUDENTS.length} students.`,
    );
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
