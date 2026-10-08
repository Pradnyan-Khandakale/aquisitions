import express from 'express';
import request from 'supertest';
import app from '#src/app.js';
import { errorHandler } from '#middleware/error.middleware.js';
import { requestIdMiddleware } from '#middleware/request-id.middleware.js';
import { redact, redactString } from '#utils/redact.js';
import { isValidRequestId, generateRequestId } from '#utils/request-context.js';

describe('Observability & Operational Readiness (Phase 4.2)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Request ID Correlation & Context', () => {
    it('generates a UUID v4 request ID if no header is supplied', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      const reqId = res.headers['x-request-id'];
      expect(reqId).toBeDefined();
      expect(isValidRequestId(reqId)).toBe(true);
      // Verify UUID structure
      expect(reqId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('honors a valid incoming x-request-id header', async () => {
      const customId = 'client-trace-12345-abcde';
      const res = await request(app)
        .get('/health/live')
        .set('x-request-id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('honors a valid incoming x-correlation-id header', async () => {
      const customCorrelationId = 'upstream-service-correlation-999';
      const res = await request(app)
        .get('/health/live')
        .set('x-correlation-id', customCorrelationId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customCorrelationId);
    });

    it('replaces an unsafe or malformed incoming request ID with a new UUID', async () => {
      const unsafeId = '; DROP TABLE users; <script>bad</script>';
      const res = await request(app)
        .get('/health/live')
        .set('x-request-id', unsafeId);

      expect(res.status).toBe(200);
      const reqId = res.headers['x-request-id'];
      expect(reqId).not.toBe(unsafeId);
      expect(isValidRequestId(reqId)).toBe(true);
    });

    it('validates request ID helper functions', () => {
      expect(isValidRequestId('abc-123_XYZ')).toBe(true);
      expect(isValidRequestId('')).toBe(false);
      expect(isValidRequestId(null)).toBe(false);
      expect(isValidRequestId('a'.repeat(65))).toBe(false);
      expect(generateRequestId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('Error Observability & Request Correlation', () => {
    it('propagates request ID on client error responses (401)', async () => {
      const customId = 'auth-error-trace-111';
      const res = await request(app)
        .post('/api/auth/sign-in')
        .set('x-request-id', customId)
        .send({ email: 'nonexistent@example.test', password: 'bad' });

      expect(res.status).toBe(401);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('propagates request ID on validation error responses (400)', async () => {
      const customId = 'validation-trace-222';
      const res = await request(app)
        .post('/api/auth/sign-up')
        .set('x-request-id', customId)
        .send({});

      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('sanitizes 500 error messages in production mode to prevent information leakage', async () => {
      process.env.NODE_ENV = 'production';

      const testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.get('/test-internal-error', () => {
        throw new Error(
          'FATAL: Connection to postgresql://neon:dbpass123@ep-cool.aws.neon.tech/neondb failed'
        );
      });
      testApp.use(errorHandler);

      const customId = 'error-sanitize-trace-333';
      const res = await request(testApp)
        .get('/test-internal-error')
        .set('x-request-id', customId);

      expect(res.status).toBe(500);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body).toHaveProperty('error', 'Internal Server Error');
      expect(res.body).toHaveProperty('message', 'Internal Server Error');
      expect(res.body).toHaveProperty('requestId', customId);
      // Ensure database connection string and password was NOT leaked to the response
      expect(JSON.stringify(res.body)).not.toContain('dbpass123');
      expect(JSON.stringify(res.body)).not.toContain('postgresql://');
    });
  });

  describe('Safe Log Redaction Security (Step 4)', () => {
    it('redacts database credentials in connection strings', () => {
      const raw =
        'Connecting to postgresql://neondb_owner:npg_SecretPass999@ep-cool-proj-12345.us-east-2.aws.neon.tech/acquisitions_test?sslmode=require';
      const sanitized = redactString(raw);

      expect(sanitized).not.toContain('npg_SecretPass999');
      expect(sanitized).toContain(
        'postgresql://neondb_owner:[REDACTED]@ep-cool-proj-12345.us-east-2.aws.neon.tech/acquisitions_test?sslmode=require'
      );
    });

    it('redacts JWT tokens', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTIzLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.abcdef1234567890abcdef1234567890abcdef123';
      const logMessage = `User authenticated with session token ${token}`;
      const sanitized = redactString(logMessage);

      expect(sanitized).not.toContain(token);
      expect(sanitized).toContain('[REDACTED_JWT]');
    });

    it('redacts Arcjet API keys', () => {
      const key = 'ajkey_01jh89f5k2m80p44n47t9r3x2a';
      const logMessage = `Arcjet initialized with key: ${key}`;
      const sanitized = redactString(logMessage);

      expect(sanitized).not.toContain(key);
      expect(sanitized).toContain('[REDACTED_ARCJET_KEY]');
    });

    it('redacts Bearer authorization headers and cookies', () => {
      const headerStr = 'Authorization: Bearer super-secret-bearer-token-12345';
      const cookieStr = 'Cookie: token=user-session-token-67890; other=val';

      expect(redactString(headerStr)).toContain('Bearer [REDACTED]');
      expect(redactString(cookieStr)).toContain('token=[REDACTED]');
    });

    it('redacts bcrypt password hashes in log strings', () => {
      const hash =
        '$2a$12$e80yvXn3U126l4J8fT5F4.Vj6M7k3a4h8q9r1s2t3u4v5w6x7y8z9';
      const logMessage = `Stored user hash: ${hash}`;
      const sanitized = redactString(logMessage);

      expect(sanitized).not.toContain(hash);
      expect(sanitized).toContain('[REDACTED_HASH]');
    });

    it('recursively redacts sensitive keys in objects without mutation', () => {
      const original = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'PlainTextPassword123!',
        nested: {
          jwt_secret: 'super-secret-key-32bytes',
          token: 'active-session-token',
          safeField: 'safeValue',
        },
        database_url: 'postgresql://usr:pwd@host/db',
      };

      const sanitized = redact(original);

      // Verify original object was NOT mutated
      expect(original.password).toBe('PlainTextPassword123!');
      expect(original.nested.jwt_secret).toBe('super-secret-key-32bytes');

      // Verify sanitized copy has redacted values
      expect(sanitized.name).toBe('John Doe');
      expect(sanitized.email).toBe('john@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.nested.jwt_secret).toBe('[REDACTED]');
      expect(sanitized.nested.token).toBe('[REDACTED]');
      expect(sanitized.nested.safeField).toBe('safeValue');
      expect(sanitized.database_url).toBe('[REDACTED]');
    });

    it('safely handles Error objects with sensitive messages and stacks', () => {
      const error = new Error(
        'Database connection failed for postgresql://app_user:ultraSecret99@neon.tech/db'
      );
      const sanitized = redact(error);

      expect(sanitized.message).not.toContain('ultraSecret99');
      expect(sanitized.message).toContain(
        'postgresql://app_user:[REDACTED]@neon.tech/db'
      );
      expect(sanitized.stack).not.toContain('ultraSecret99');
    });

    it('safely handles circular references without infinite recursion', () => {
      const circularObj = { name: 'Parent' };
      circularObj.self = circularObj;

      const result = redact(circularObj);
      expect(result.name).toBe('Parent');
      expect(result.self).toBe('[Circular]');
    });
  });

  describe('Health Probes Observability Contract', () => {
    it('/health/live returns process uptime and timestamp with correlation ID', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'OK');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('/health/ready verifies database connectivity with correlation ID', async () => {
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'READY');
      expect(res.body).toHaveProperty('database', 'connected');
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });
});
