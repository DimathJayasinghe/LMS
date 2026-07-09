import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as SubjectService from '@/services/subject.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  subjectIdParamSchema,
  updateSubjectSchema,
} from '@/schemas/subject.schema';

export const createSubject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const input = createSubjectSchema.parse(req.body);
  const subject = await SubjectService.createSubject(input);

  void AuditService.log({
    action: AUDIT_ACTION.SUBJECT_CREATED,
    description: `Subject "${subject.name}" created`,
    targetType: 'Subject',
    targetId: subject.id,
    context: extractAuditContext(req),
  });

  res.status(201).json({
    status: 'success',
    data: subject,
    message: 'Subject created successfully.',
  });
});

export const listSubjects = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const query = listSubjectsQuerySchema.parse(req.query);
  const subjects = await SubjectService.listSubjects(query, req.user!);

  res.status(200).json({
    status: 'success',
    data: subjects,
    count: subjects.length,
  });
});

export const getSubjectById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = subjectIdParamSchema.parse(req.params);
  const subject = await SubjectService.getSubjectById(id, req.user!);

  res.status(200).json({
    status: 'success',
    data: subject,
  });
});

export const updateSubject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = subjectIdParamSchema.parse(req.params);
  const input = updateSubjectSchema.parse(req.body);
  const subject = await SubjectService.updateSubject(id, input);

  void AuditService.log({
    action: AUDIT_ACTION.SUBJECT_UPDATED,
    targetType: 'Subject',
    targetId: id,
    context: extractAuditContext(req),
  });

  res.status(200).json({
    status: 'success',
    data: subject,
    message: 'Subject updated successfully.',
  });
});
