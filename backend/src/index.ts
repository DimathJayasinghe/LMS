import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';

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

// ─── Health Check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'success', data: { timestamp: new Date().toISOString() } });
});

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Routes will be mounted here as they are implemented:
// app.use('/api/users', userRoutes);
// app.use('/api/classes', classRoutes);
// app.use('/api/attendance', attendanceRoutes);
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

export default app;
