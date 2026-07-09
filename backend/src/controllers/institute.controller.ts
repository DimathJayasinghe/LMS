import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as InstituteService from '@/services/institute.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
  createInstituteSchema,
  instituteIdParamSchema,
  listInstitutesQuerySchema,
  updateInstituteSchema,
} from '@/schemas/institute.schema';

export const createInstitute = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const input = createInstituteSchema.parse(req.body);
  const institute = await InstituteService.createInstitute(input);

  void AuditService.log({
    action: AUDIT_ACTION.INSTITUTE_CREATED,
    description: `Institute "${institute.name}" created`,
    targetType: 'Institute',
    targetId: institute.id,
    context: extractAuditContext(req),
  });

  res.status(201).json({ status: 'success', data: institute, message: 'Institute created successfully.' });
});

export const listInstitutes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const query = listInstitutesQuerySchema.parse(req.query);
  const institutes = await InstituteService.listInstitutes(query, req.user!);

  res.status(200).json({ status: 'success', data: institutes, count: institutes.length });
});

export const getInstituteById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = instituteIdParamSchema.parse(req.params);
  const institute = await InstituteService.getInstituteById(id, req.user!);

  res.status(200).json({ status: 'success', data: institute });
});

export const updateInstitute = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = instituteIdParamSchema.parse(req.params);
  const input = updateInstituteSchema.parse(req.body);
  const institute = await InstituteService.updateInstitute(id, input);

  void AuditService.log({
    action: AUDIT_ACTION.INSTITUTE_UPDATED,
    targetType: 'Institute',
    targetId: id,
    context: extractAuditContext(req),
  });

  res.status(200).json({ status: 'success', data: institute, message: 'Institute updated successfully.' });
});
