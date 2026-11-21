import { Router } from 'express';
import { Role } from '@prisma/client';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody } from '@/middleware/validate.middleware';
import { updateSettingSchema } from '@/schemas/settings.schema';
import * as SettingsController from '@/controllers/settings.controller';

export const settingsRoutes = Router();
settingsRoutes.get('/', verifyToken, requireRole(Role.SUPER_ADMIN), SettingsController.listSettings);
settingsRoutes.patch('/:key', verifyToken, requireRole(Role.SUPER_ADMIN), validateBody(updateSettingSchema), SettingsController.updateSetting);
