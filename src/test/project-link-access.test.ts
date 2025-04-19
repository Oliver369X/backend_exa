import request from 'supertest';
import { app } from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let ownerToken: string;
let projectId: string;

beforeAll(async () => {
  // Limpieza completa de datos relacionados
  await prisma.projectPermission.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await request(app)
    .post('/auth/register')
    .send({ email: 'owner@link.com', password: 'test1234', name: 'Owner' });
  const login = await request(app)
    .post('/auth/login')
    .send({ email: 'owner@link.com', password: 'test1234' });
  ownerToken = login.body.token;
});

describe('PATCH /projects/:id/link-access', () => {
  beforeEach(async () => {
    // Crea un proyecto limpio antes de cada test
    await prisma.projectPermission.deleteMany({});
    await prisma.project.deleteMany({});
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Link Project' });
    projectId = res.body.id;
  });

  it('permite al owner cambiar el nivel de acceso y regenerar el token', async () => {
    // Cambia el nivel de acceso a 'read'
    const patch1 = await request(app)
      .patch(`/projects/${projectId}/link-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ linkAccess: 'read' });
    expect(patch1.status).toBe(200);
    expect(patch1.body.linkAccess).toBe('read');
    expect(typeof patch1.body.linkToken).toBe('string');

    // Regenera el token
    const oldToken = patch1.body.linkToken;
    const patch2 = await request(app)
      .patch(`/projects/${projectId}/link-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ regenerate: true });
    expect(patch2.status).toBe(200);
    expect(patch2.body.linkAccess).toBe('read');
    expect(typeof patch2.body.linkToken).toBe('string');
    expect(patch2.body.linkToken).not.toBe(oldToken);
  });

  it('prohíbe a otros usuarios cambiar el acceso por enlace', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'other@link.com', password: 'test1234', name: 'Other' });
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'other@link.com', password: 'test1234' });
    const otherToken = login.body.token;
    const patch = await request(app)
      .patch(`/projects/${projectId}/link-access`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ linkAccess: 'write' });
    expect(patch.status).toBe(403);
  });

  it('devuelve 404 si el proyecto no existe', async () => {
    const patch = await request(app)
      .patch('/projects/doesnotexist/link-access')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ linkAccess: 'read' });
    expect(patch.status).toBe(404);
  });
});

// Limpieza final
afterAll(async () => {
  await prisma.projectPermission.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
});
