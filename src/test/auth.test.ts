import request from 'supertest';
import { app } from '../app';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
const prisma = new PrismaClient();

describe('Auth Module', () => {
  const testEmail = 'test@example.com';
  const testPassword = '12345678';
  let token = '';

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  it('should register a user', async () => {
    const res = await request(app).post('/auth/register').send({ email: testEmail, password: testPassword, name: 'Test User' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(testEmail);
  });

  it('should login a user', async () => {
    const res = await request(app).post('/auth/login').send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  it('should get user profile with JWT', async () => {
    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });

  it('should not get profile without JWT', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No token provided');
  });
});
