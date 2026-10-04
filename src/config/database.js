import 'dotenv/config';

import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

if (
  process.env.NODE_ENV === 'development' &&
  (process.env.NEON_LOCAL === 'true' || process.env.USE_NEON_LOCAL === 'true')
) {
  neonConfig.fetchEndpoint = 'http://neon-local:5432/sql';
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}

const getDatabaseUrl = () => {
  if (process.env.NODE_ENV === 'test') {
    let resolvedUrl = process.env.TEST_DATABASE_URL;

    if (!resolvedUrl && process.env.DATABASE_URL) {
      try {
        const parsed = new URL(process.env.DATABASE_URL);
        if (parsed.pathname === '/neondb' || parsed.pathname === '/') {
          parsed.pathname = '/acquisitions_test';
          resolvedUrl = parsed.toString();
        } else if (parsed.pathname.includes('test')) {
          resolvedUrl = parsed.toString();
        }
      } catch {
        // fallback
      }
    }

    if (!resolvedUrl) {
      throw new Error(
        'FATAL: TEST_DATABASE_URL or DATABASE_URL must be configured for test environment.'
      );
    }

    // Hard safety guard: Verify resolved test URL does not point to default/production database
    try {
      const parsed = new URL(resolvedUrl);
      if (
        parsed.pathname === '/neondb' ||
        parsed.pathname === '/postgres' ||
        !parsed.pathname.includes('test')
      ) {
        throw new Error(
          `FATAL SAFETY VIOLATION: Test database URL points to unsafe database target "${parsed.pathname}". Aborting.`
        );
      }
    } catch (err) {
      if (err.message.includes('FATAL SAFETY VIOLATION')) throw err;
      throw new Error(`FATAL: Invalid test database URL: ${err.message}`, {
        cause: err,
      });
    }

    return resolvedUrl;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('FATAL: DATABASE_URL is not set.');
  }

  return process.env.DATABASE_URL;
};

const sql = neon(getDatabaseUrl());

const db = drizzle(sql);

export { db, sql, getDatabaseUrl };
