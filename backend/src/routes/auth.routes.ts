import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { verifyToken } from '../middleware/auth.middleware';
import { registerSchema, loginSchema } from '../schemas/auth.schema';

const router = Router();

// POST /api/auth/register — Create a new student account
router.post('/register', validateBody(registerSchema), AuthController.register);

// POST /api/auth/login — Authenticate user
router.post('/login', validateBody(loginSchema), AuthController.login);

// POST /api/auth/refresh — Silent token rotation
router.post('/refresh', AuthController.refresh);

// POST /api/auth/logout — Clear session
router.post('/logout', AuthController.logout);

// GET /api/auth/me — Get current authenticated user
router.get('/me', verifyToken, AuthController.getMe);

export default router;
