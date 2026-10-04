import request from 'supertest';
import app from '#src/app.js';
import { db } from '#config/database.js';
import { users } from '#models/user.model.js';
import { eq } from 'drizzle-orm';
import { cleanDatabase } from '../helpers/db.helper.js';

describe('POST /api/auth/sign-up', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  it('should successfully register a new user with valid payload', async () => {
    const payload = {
      name: 'Valid User',
      email: 'valid.user@example.test',
      password: 'StrongPassword123!',
    };

    const res = await request(app).post('/api/auth/sign-up').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message', 'User registered');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.name).toBe('Valid User');
    expect(res.body.user.email).toBe('valid.user@example.test');
    expect(res.body.user.role).toBe('user');
    // Ensure password is not returned in response
    expect(res.body.user.password).toBeUndefined();

    // Verify token cookie is set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.startsWith('token='))).toBe(true);

    // Verify record exists in database
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'valid.user@example.test'))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser.name).toBe('Valid User');
    expect(dbUser.password).not.toBe('StrongPassword123!');
  });

  it('should reject signup with missing required fields', async () => {
    const res = await request(app).post('/api/auth/sign-up').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
    expect(res.body).toHaveProperty('details');
  });

  it('should reject signup with malformed email', async () => {
    const res = await request(app).post('/api/auth/sign-up').send({
      name: 'Bad Email',
      email: 'not-an-email',
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('should reject signup with password shorter than 6 characters', async () => {
    const res = await request(app).post('/api/auth/sign-up').send({
      name: 'Short Password',
      email: 'short.pwd@example.test',
      password: '123',
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('should reject duplicate email with 409 Conflict', async () => {
    const payload = {
      name: 'First User',
      email: 'duplicate@example.test',
      password: 'Password123!',
    };

    const firstRes = await request(app).post('/api/auth/sign-up').send(payload);

    expect(firstRes.status).toBe(201);

    const secondRes = await request(app).post('/api/auth/sign-up').send({
      name: 'Second User',
      email: 'duplicate@example.test',
      password: 'AnotherPassword123!',
    });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body).toHaveProperty('error', 'Email already exist');
  });

  describe('Security Regression: Role Assignment', () => {
    it('should NOT allow a public signup to self-assign admin privileges', async () => {
      const payload = {
        name: 'Test User',
        email: 'test.admin.attempt@example.test',
        password: 'StrongPassword123',
        role: 'admin',
      };

      const res = await request(app).post('/api/auth/sign-up').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('user');
      expect(res.body.user.role).not.toBe('admin');

      // Verify directly in the database
      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'test.admin.attempt@example.test'))
        .limit(1);

      expect(dbUser).toBeDefined();
      expect(dbUser.role).toBe('user');
      expect(dbUser.role).not.toBe('admin');
    });
  });
});
