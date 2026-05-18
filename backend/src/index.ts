import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectRedis } from './config/redis';
import { createRateLimiters } from './config/rate-limiter';
import { errorHandler } from './middleware/error.middleware';
import { createAuthRouter } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { classRoutes } from './routes/class.routes';
import { attendanceRoutes } from './routes/attendance.routes';

const app = express();

// ─── Security ────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true, // Required for HTTP-only cookies
  }),
);

// ─── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ─── Bootstrap ───────────────────────────────────────────────
const bootstrap = async (): Promise<void> => {
  // Attempt Redis connection (non-blocking — app works without it)
  await connectRedis();

  // Create rate limiters AFTER Redis connection attempt
  // so they can detect Redis status and choose the right store
  const { globalLimiter, authLimiter } = createRateLimiters();

  // ─── Rate Limiting (global) ─────────────────────────────────
  app.use('/api', globalLimiter);

  // ─── Health Check ────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'success', data: { timestamp: new Date().toISOString() } });
  });

  // ─── API Routes ──────────────────────────────────────────────
  app.use('/api/auth', createAuthRouter(authLimiter));

  // ─── User Management ─────────────────────────────────────────
  app.use('/api/users', userRoutes);
  app.use('/api/classes', classRoutes);
  app.use('/api/attendance', attendanceRoutes);
  // app.use('/api/exams', examRoutes);
  // app.use('/api/submissions', submissionRoutes);
  // app.use('/api/payments', paymentRoutes);
  // app.use('/api/videos', videoRoutes);

  // ─── Global Error Handler (must be last) ─────────────────────
  app.use(errorHandler);

  // ─── Start Server ────────────────────────────────────────────
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server is running');
  });
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

export default app;
