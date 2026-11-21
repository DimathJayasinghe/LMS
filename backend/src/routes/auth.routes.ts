import { Router, RequestHandler } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { verifyToken } from '../middleware/auth.middleware';
import { registerSchema, loginSchema } from '../schemas/auth.schema';

/**
 * Creates the auth router with the injected rate limiter.
 * The limiter is created lazily after Redis connection status is known.
 */
export const createAuthRouter = ({ loginAccountLimiter, loginIpLimiter, registerLimiter, refreshLimiter }: {
  loginAccountLimiter: RequestHandler;
  loginIpLimiter: RequestHandler;
  registerLimiter: RequestHandler;
  refreshLimiter: RequestHandler;
}): Router => {
  const router = Router();

  // POST /api/auth/register — Create a new student account
  // Middleware order: rateLimiter → validateBody → controller
  router.post('/register', registerLimiter, validateBody(registerSchema), AuthController.register);

  // POST /api/auth/login — Authenticate user
  // Stricter rate limit to prevent brute-force password attacks
  router.post('/login', loginIpLimiter, loginAccountLimiter, validateBody(loginSchema), AuthController.login);

  // POST /api/auth/refresh — Silent token rotation
  router.post('/refresh', refreshLimiter, AuthController.refresh);

  // POST /api/auth/logout — Clear session
  router.post('/logout', AuthController.logout);

  // GET /api/auth/me — Get current authenticated user
  router.get('/me', verifyToken, AuthController.getMe);

  return router;
};
