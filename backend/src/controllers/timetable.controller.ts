import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as TimetableService from '@/services/timetable.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
  createTimetableSlotSchema,
  generateSessionsSchema,
  listTimetableQuerySchema,
  timetableSlotIdParamSchema,
  updateTimetableSlotSchema,
} from '@/schemas/timetable.schema';

export const createSlot = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const input = createTimetableSlotSchema.parse(req.body);
  const slot = await TimetableService.createSlot(input, req.user!);

  void AuditService.log({
    action: AUDIT_ACTION.TIMETABLE_SLOT_CREATED,
    targetType: 'TimetableSlot',
    targetId: slot.id,
    context: extractAuditContext(req),
  });

  res.status(201).json({ status: 'success', data: slot, message: 'Timetable slot created.' });
});

export const listSlots = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const query = listTimetableQuerySchema.parse(req.query);
  const slots = await TimetableService.listSlots(query, req.user!);

  res.status(200).json({ status: 'success', data: slots, count: slots.length });
});

export const getSlotById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = timetableSlotIdParamSchema.parse(req.params);
  const slot = await TimetableService.getSlotById(id);

  res.status(200).json({ status: 'success', data: slot });
});

export const updateSlot = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = timetableSlotIdParamSchema.parse(req.params);
  const input = updateTimetableSlotSchema.parse(req.body);
  const slot = await TimetableService.updateSlot(id, input, req.user!);

  void AuditService.log({
    action: AUDIT_ACTION.TIMETABLE_SLOT_UPDATED,
    targetType: 'TimetableSlot',
    targetId: id,
    context: extractAuditContext(req),
  });

  res.status(200).json({ status: 'success', data: slot, message: 'Timetable slot updated.' });
});

export const deleteSlot = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = timetableSlotIdParamSchema.parse(req.params);
  await TimetableService.deleteSlot(id, req.user!);

  void AuditService.log({
    action: AUDIT_ACTION.TIMETABLE_SLOT_DELETED,
    targetType: 'TimetableSlot',
    targetId: id,
    context: extractAuditContext(req),
  });

  res.status(200).json({ status: 'success', data: null, message: 'Timetable slot deleted.' });
});

export const generateSessions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const input = generateSessionsSchema.parse(req.body);
  const result = await TimetableService.generateSessions(input.from, input.to);

  void AuditService.log({
    action: AUDIT_ACTION.TIMETABLE_GENERATED,
    description: `${result.created} sessions generated (${result.skipped} already existed)`,
    targetType: 'Timetable',
    context: extractAuditContext(req),
  });

  res.status(200).json({ status: 'success', data: result, message: 'Sessions generated from timetable.' });
});
