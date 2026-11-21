import pinoHttp from 'pino-http';
import type { Options } from 'pino-http';
import { logger } from '@/config/logger';

export const createRequestLogger = (baseLogger: Options['logger']) => pinoHttp({
  logger: baseLogger,
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
  // Cookies and authorization headers contain reusable credentials. pino-http
  // serializes response headers too, so Set-Cookie must be redacted explicitly.
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
  ],
});

export const requestLogger = createRequestLogger(logger as unknown as Options['logger']);
