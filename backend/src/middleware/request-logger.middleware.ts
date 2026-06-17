import pinoHttp from 'pino-http';
import type { Options } from 'pino-http';
import { logger } from '@/config/logger';

export const requestLogger = pinoHttp({
  logger: logger as unknown as Options['logger'],
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
