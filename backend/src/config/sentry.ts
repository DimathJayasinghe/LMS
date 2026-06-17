import * as Sentry from '@sentry/node';
import { env } from './env';
import { logger } from './logger';

export interface SentryContext {
  tags?: Record<string, string>;
  extras?: Record<string, unknown>;
  user?: { id?: string; role?: string };
}

const isEnabled = Boolean(env.SENTRY_DSN);

export const initSentry = (): void => {
  if (!isEnabled) {
    if (env.NODE_ENV === 'production') {
      logger.warn('SENTRY_DSN not set; error tracking is disabled');
    }
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
  });
};

export const captureException = (err: unknown, context?: SentryContext): void => {
  if (!isEnabled) return;

  Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.extras) {
      for (const [key, value] of Object.entries(context.extras)) {
        scope.setExtra(key, value);
      }
    }

    if (context?.user) {
      scope.setUser(context.user);
    }

    Sentry.captureException(err);
  });
};
