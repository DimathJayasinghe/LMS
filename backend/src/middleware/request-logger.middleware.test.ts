import { Writable } from 'node:stream';
import pino from 'pino';
import type { Options } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { createRequestLogger } from './request-logger.middleware';

describe('request logger credential redaction', () => {
  it('redacts request credentials and response Set-Cookie tokens', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const testLogger = pino({ level: 'info' }, destination);
    const middleware = createRequestLogger(testLogger as unknown as Options['logger']);
    middleware.logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer authorization-secret-value',
            cookie: 'access_token=request-cookie-secret-value',
          },
        },
        res: {
          headers: {
            'set-cookie': [
              'access_token=access-secret-value; HttpOnly',
              'refresh_token=refresh-secret-value; HttpOnly',
            ],
          },
        },
      },
      'request completed',
    );

    const output = lines.join('');
    expect(output).not.toContain('authorization-secret-value');
    expect(output).not.toContain('request-cookie-secret-value');
    expect(output).not.toContain('access-secret-value');
    expect(output).not.toContain('refresh-secret-value');
    expect(output).toContain('[Redacted]');
  });
});
