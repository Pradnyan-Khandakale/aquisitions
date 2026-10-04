import request from 'supertest';
import app from '#src/app.js';
import {
  cleanDatabase,
  createTestUser,
  createTestCompany,
  seedDealStages,
} from '../helpers/db.helper.js';

describe('POST /api/auth/sign-in', () => {
  const userPassword = 'TestPassword123!';
  let seededUser;

  beforeEach(async () => {
    await cleanDatabase();
    seededUser = await createTestUser({
      name: 'Sign-in Tester',
      email: 'signin.tester@example.test',
      password: userPassword,
      role: 'user',
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  it('should sign in successfully with valid credentials', async () => {
    const res = await request(app).post('/api/auth/sign-in').send({
      email: seededUser.email,
      password: userPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'User signed in successfully');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe(seededUser.id);
    expect(res.body.user.email).toBe(seededUser.email);
    expect(res.body.user.password).toBeUndefined();

    // Verify authentication cookie is produced
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.startsWith('token='))).toBe(true);
  });

  it('should reject sign-in with invalid password', async () => {
    const res = await request(app).post('/api/auth/sign-in').send({
      email: seededUser.email,
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('should reject sign-in with non-existent email', async () => {
    const res = await request(app).post('/api/auth/sign-in').send({
      email: 'nobody@example.test',
      password: userPassword,
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });

  it('should reject sign-in with missing email or password', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: seededUser.email });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('should allow authenticated identity to use protected routes with cookie', async () => {
    const signinRes = await request(app).post('/api/auth/sign-in').send({
      email: seededUser.email,
      password: userPassword,
    });

    const cookie = signinRes.headers['set-cookie'];

    const stages = await seedDealStages();
    const company = await createTestCompany();

    // Create acquisition with auth cookie
    const createRes = await request(app)
      .post('/api/acquisitions')
      .set('Cookie', cookie)
      .send({
        title: 'Acquisition by Authenticated User',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.creator).toBeDefined();
    expect(createRes.body.data.creator.id).toBe(seededUser.id);
  });
});
