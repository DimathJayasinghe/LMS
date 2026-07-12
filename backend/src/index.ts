import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './config/logger';
import { initSentry, captureException } from './config/sentry';
import { connectRedis, disconnectRedis } from './config/redis';
import { initStreamService, shutdownStreamService } from './services/stream.service';
import { createRateLimiters } from './config/rate-limiter';
import { requestLogger } from './middleware/request-logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import { createAuthRouter } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { subjectRoutes } from './routes/subject.routes';
import { instituteRoutes } from './routes/institute.routes';
import { timetableRoutes } from './routes/timetable.routes';
import { classRoutes } from './routes/class.routes';
import { enrollmentRoutes } from './routes/enrollment.routes';
import { attendanceRoutes } from './routes/attendance.routes';
import { videoRoutes } from './routes/video.routes';
import { examRoutes } from './routes/exam.routes';
import { submissionRoutes } from './routes/submission.routes';
import { paymentRoutes } from './routes/payment.routes';
import { streamRoutes } from './routes/stream.routes';
import { auditRoutes } from './routes/audit.routes';
import { notificationRoutes } from './routes/notification.routes';
import { notificationSettingRoutes } from './routes/notification-setting.routes';

initSentry();

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
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    (req as Request).rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(requestLogger);

// ─── Bootstrap ───────────────────────────────────────────────
const bootstrap = async (): Promise<void> => {
  // Attempt Redis connection (non-blocking — app works without it)
  await connectRedis();
  await initStreamService();

  // Create rate limiters AFTER Redis connection attempt
  // so they can detect Redis status and choose the right store
  const { globalLimiter, authLimiter, streamLimiter } = createRateLimiters();

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
  app.use('/api/subjects', subjectRoutes);
  app.use('/api/institutes', instituteRoutes);
  app.use('/api/timetable', timetableRoutes);
  app.use('/api/classes', classRoutes);
  app.use('/api/enrollments', enrollmentRoutes);
  app.use('/api/attendance', attendanceRoutes);
  // Extra throttle on the stream-token endpoint (on top of the global limiter).
  app.use('/api/videos/:id/stream', streamLimiter);
  app.use('/api/videos', videoRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/notification-settings', notificationSettingRoutes);

  // ─── Global Error Handler (must be last) ─────────────────────
  app.use(errorHandler);

  // ─── Start Server ────────────────────────────────────────────
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server is running');
  });
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  logger.info({ signal }, 'Shutting down');
  await shutdownStreamService();
  await disconnectRedis();
  process.exit(exitCode);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  captureException(reason, { tags: { origin: 'unhandledRejection' } });
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  captureException(err, { tags: { origin: 'uncaughtException' } });
  void shutdown('uncaughtException', 1);
});

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  captureException(err, { tags: { origin: 'bootstrap' } });
  process.exit(1);
});

export default app;
