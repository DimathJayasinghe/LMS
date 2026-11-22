import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ConsoleController from '@/controllers/console.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateQuery } from '@/middleware/validate.middleware';
import { consoleCashQuerySchema, consoleOwingQuerySchema } from '@/schemas/console.schema';

/** The owner's read-only console: every route is a GET for the owner, and nothing here may ever write. */
export const consoleRoutes = Router();

consoleRoutes.get('/cash', verifyToken, requireRole(Role.SUPER_ADMIN), validateQuery(consoleCashQuerySchema), ConsoleController.cashPanel);
consoleRoutes.get('/owing', verifyToken, requireRole(Role.SUPER_ADMIN), validateQuery(consoleOwingQuerySchema), ConsoleController.owingPanel);
