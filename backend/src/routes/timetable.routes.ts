import { Router } from 'express';
import { Role } from '@prisma/client';
import * as TimetableController from '@/controllers/timetable.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
  createTimetableSlotSchema,
  generateSessionsSchema,
  listTimetableQuerySchema,
  timetableSlotIdParamSchema,
  updateTimetableSlotSchema,
} from '@/schemas/timetable.schema';

export const timetableRoutes = Router();

// ─── Slots (recurring weekly template) ──────────────────────
// Managed by Super Admin, the course's Teacher, or a front-desk Admin.
timetableRoutes.post(
  '/slots',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.ADMIN),
  validateBody(createTimetableSlotSchema),
  TimetableController.createSlot,
);

// The timetable itself — any authenticated user sees the schedule.
timetableRoutes.get(
  '/slots',
  verifyToken,
  validateQuery(listTimetableQuerySchema),
  TimetableController.listSlots,
);

timetableRoutes.get(
  '/slots/:id',
  verifyToken,
  validateParams(timetableSlotIdParamSchema),
  TimetableController.getSlotById,
);

timetableRoutes.patch(
  '/slots/:id',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.ADMIN),
  validateParams(timetableSlotIdParamSchema),
  validateBody(updateTimetableSlotSchema),
  TimetableController.updateSlot,
);

timetableRoutes.delete(
  '/slots/:id',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.ADMIN),
  validateParams(timetableSlotIdParamSchema),
  TimetableController.deleteSlot,
);

// ─── Manual generation of dated sessions from slots ─────────
timetableRoutes.post(
  '/generate',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.ADMIN),
  validateBody(generateSessionsSchema),
  TimetableController.generateSessions,
);
