import request from 'supertest';
import { app } from '../app';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

const prisma = new PrismaClient();

// Helper to create a user and get JWT
async function createUserAndLogin(email: string, password: string, name: string) {
  // Busca el usuario por email
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    // Borra permisos y versiones de proyectos del usuario
    await prisma.projectPermission.deleteMany({ where: { project: { ownerId: user.id } } });
    await prisma.projectVersion.deleteMany({ where: { project: { ownerId: user.id } } });
    await prisma.project.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.deleteMany({ where: { email } });
  }
  await request(app).post('/auth/register').send({ email, password, name });
  const loginRes = await request(app).post('/auth/login').send({ email, password });
  return loginRes.body.token;
}

describe('Project Module', () => {
  const email = 'owner@example.com';
  const password = 'testpass123';
  const name = 'Owner';
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    token = await createUserAndLogin(email, password, name);
  });

  it('should create a project', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Project' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Project');
    projectId = res.body.id;
  });

  it('should list projects for the user', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p: any) => p.id === projectId)).toBe(true);
  });

  it('should update project name', async () => {
    const res = await request(app)
      .patch(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Project' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Project');
  });

  it('should archive and unarchive project', async () => {
    let res = await request(app)
      .patch(`/projects/${projectId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isArchived: true });
    expect(res.status).toBe(200);
    expect(res.body.isArchived).toBe(true);
    res = await request(app)
      .patch(`/projects/${projectId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isArchived: false });
    expect(res.status).toBe(200);
    expect(res.body.isArchived).toBe(false);
  });

  afterAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email } });
    if (owner) {
      await prisma.projectPermission.deleteMany({ where: { project: { ownerId: owner.id } } });
      await prisma.projectVersion.deleteMany({ where: { project: { ownerId: owner.id } } });
      await prisma.project.deleteMany({ where: { ownerId: owner.id } });
      await prisma.user.deleteMany({ where: { email } });
    }
    await prisma.$disconnect();
  });
});
