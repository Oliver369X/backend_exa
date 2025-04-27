import request from 'supertest';
import { app } from '../app';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Datos de prueba
let testUserId: string;
let testToken: string;
let testProjectId: string;
let testPageId: string;
let testClientId: string;

// Configuración antes de todas las pruebas
beforeAll(async () => {
  // Crear usuario de prueba
  const testUser = await prisma.user.create({
    data: {
      email: 'test-pages@example.com',
      passwordHash: 'dummy-hash-for-test',
      name: 'Test Pages User'
    }
  });
  
  testUserId = testUser.id;
  
  // Crear token JWT
  testToken = jwt.sign(
    { id: testUser.id, email: testUser.email, name: testUser.name },
    process.env.JWT_SECRET || 'test-secret'
  );
  
  // Crear proyecto de prueba
  const testProject = await prisma.project.create({
    data: {
      name: 'Test Project for Pages',
      ownerId: testUser.id
    }
  });
  
  testProjectId = testProject.id;
  testClientId = `page-${Date.now()}-test`;
});

// Limpieza después de todas las pruebas
afterAll(async () => {
  // Eliminar datos de prueba
  await prisma.page.deleteMany({
    where: {
      projectId: testProjectId
    }
  });
  
  await prisma.project.delete({
    where: {
      id: testProjectId
    }
  });
  
  await prisma.user.delete({
    where: {
      id: testUserId
    }
  });
  
  await prisma.$disconnect();
});

describe('API de Páginas', () => {
  // Prueba: Crear una página
  test('Debería crear una nueva página', async () => {
    const response = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        projectId: testProjectId,
        name: 'Página de Prueba',
        clientId: testClientId,
        html: '<div>Contenido de prueba</div>',
        css: 'body { color: red; }',
        components: { type: 'wrapper', components: [] },
        isDefault: true
      });
      
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('Página de Prueba');
    expect(response.body.clientId).toBe(testClientId);
    expect(response.body.isDefault).toBe(true);
    
    testPageId = response.body.id;
  });
  
  // Prueba: Obtener todas las páginas de un proyecto
  test('Debería obtener todas las páginas de un proyecto', async () => {
    const response = await request(app)
      .get(`/api/pages?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('name');
  });
  
  // Prueba: Obtener una página específica
  test('Debería obtener una página específica por ID', async () => {
    const response = await request(app)
      .get(`/api/pages/${testPageId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', testPageId);
    expect(response.body).toHaveProperty('name', 'Página de Prueba');
  });
  
  // Prueba: Obtener una página por clientId
  test('Debería obtener una página por clientId', async () => {
    const response = await request(app)
      .get(`/api/pages/by-client-id/${testClientId}?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('clientId', testClientId);
  });
  
  // Prueba: Actualizar una página
  test('Debería actualizar una página existente', async () => {
    const response = await request(app)
      .put(`/api/pages/${testPageId}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: 'Página de Prueba Actualizada',
        html: '<div>Contenido actualizado</div>'
      });
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('name', 'Página de Prueba Actualizada');
  });
  
  // Prueba: Eliminar una página
  test('Debería marcar una página como eliminada', async () => {
    const response = await request(app)
      .delete(`/api/pages/${testPageId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    
    // Verificar que la página no aparece en la lista de páginas
    const listResponse = await request(app)
      .get(`/api/pages?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(listResponse.status).toBe(200);
    const pageFound = listResponse.body.find((page: any) => page.id === testPageId);
    expect(pageFound).toBeUndefined();
  });
  
  // Prueba: Restaurar una página eliminada
  test('Debería restaurar una página eliminada', async () => {
    const response = await request(app)
      .post(`/api/pages/restore/${testPageId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('isDeleted', false);
    
    // Verificar que la página aparece de nuevo en la lista
    const listResponse = await request(app)
      .get(`/api/pages?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${testToken}`);
      
    expect(listResponse.status).toBe(200);
    const pageFound = listResponse.body.find((page: any) => page.id === testPageId);
    expect(pageFound).toBeDefined();
  });
  
  // Prueba: Permisos - No debería permitir acceder a un proyecto sin permisos
  test('No debería permitir acceder a un proyecto sin permisos', async () => {
    // Crear otro usuario sin permisos en el proyecto
    const otherUser = await prisma.user.create({
      data: {
        email: 'no-access@example.com',
        passwordHash: 'dummy-hash-for-test',
        name: 'No Access User'
      }
    });
    
    const otherToken = jwt.sign(
      { id: otherUser.id, email: otherUser.email, name: otherUser.name },
      process.env.JWT_SECRET || 'test-secret'
    );
    
    const response = await request(app)
      .get(`/api/pages?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${otherToken}`);
      
    expect(response.status).toBe(403);
    
    // Limpiar el usuario temporal
    await prisma.user.delete({
      where: { id: otherUser.id }
    });
  });
}); 