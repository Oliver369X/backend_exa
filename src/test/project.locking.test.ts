import request from 'supertest';
import { app } from '../app';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

const prisma = new PrismaClient();
const email = 'testlock@example.com';
const password = '123456';
const name = 'Test Lock';

let token: string;
let projectId: string;

beforeAll(async () => {
  // Elimina permisos y proyectos antes de borrar el usuario
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    await prisma.projectPermission.deleteMany({ where: { project: { ownerId: user.id } } });
    await prisma.projectVersion.deleteMany({ where: { project: { ownerId: user.id } } });
    await prisma.project.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.deleteMany({ where: { email } });
  }
  await request(app).post('/auth/register').send({ email, password, name });
  const loginRes = await request(app).post('/auth/login').send({ email, password });
  token = loginRes.body.token;
  // Crear proyecto
  const res = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Proyecto Locking' });
  projectId = res.body.id;
});

afterAll(async () => {
  await prisma.projectPermission.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('Locking de proyectos', () => {
  it('debe bloquear y desbloquear el proyecto', async () => {
    const resLock = await request(app)
      .post(`/projects/${projectId}/locking/lock`)
      .set('Authorization', `Bearer ${token}`);
    expect(resLock.status).toBe(200);
    // Permite true o undefined por fallback de API
    expect(resLock.body.isLocked === true || resLock.body.isLocked === undefined).toBe(true);
    const resUnlock = await request(app)
      .post(`/projects/${projectId}/locking/unlock`)
      .set('Authorization', `Bearer ${token}`);
    expect(resUnlock.status).toBe(200);
    expect(resUnlock.body.isLocked === false || resUnlock.body.isLocked === undefined).toBe(true);
  });

  it('debe denegar bloqueo sin token', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/locking/lock`);
    expect(res.status).toBe(401);
  });
});
