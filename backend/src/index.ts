import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectRedis, disconnectRedis } from './config/redis';
import { initStreamService, shutdownStreamService } from './services/stream.service';
import { createRateLimiters } from './config/rate-limiter';
import { errorHandler } from './middleware/error.middleware';
import { createAuthRouter } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { classRoutes } from './routes/class.routes';
import { attendanceRoutes } from './routes/attendance.routes';
import { videoRoutes } from './routes/video.routes';
import { examRoutes } from './routes/exam.routes';
import { submissionRoutes } from './routes/submission.routes';
import { paymentRoutes } from './routes/payment.routes';
import { streamRoutes } from './routes/stream.routes';

const app = express();
app.set('trust proxy', 1);

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
  await initStreamService();

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
  app.use('/api/videos', videoRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/stream', streamRoutes);

  // ─── Global Error Handler (must be last) ─────────────────────
  app.use(errorHandler);

  // ─── Start Server ────────────────────────────────────────────
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server is running');
  });
};

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutting down');
  await shutdownStreamService();
  await disconnectRedis();
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

export default app;
