import request from 'supertest';
import express, { Request as ExpressRequest, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { projectRouter } from '../project.router'; // Corrección: Usar el nombre exportado directamente
import { Router } from 'express';

// Mock de Prisma Client
const prisma = new PrismaClient();
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    project: {
      findUnique: jest.fn(),
    },
    // Añade otros mocks si son necesarios para otras rutas o middlewares
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

// Mock del middleware de autenticación
// Simula que siempre hay un usuario autenticado en req.user
// Puedes modificar esto para probar casos sin autenticación
jest.mock('../../auth/auth.middleware', () => ({
  authMiddleware: (req: ExpressRequest, res: Response, next: NextFunction) => {
    // Simula un usuario autenticado. Cambia 'test-user-id' según necesites.
    req.user = { id: 'test-user-id', email: 'test@example.com', name: 'Test User' };
    next();
  },
}));


const app = express();
app.use(express.json());
// Monta SÓLO el router de proyectos bajo /projects para probarlo aisladamente
app.use('/projects', projectRouter); 

// --- Pruebas ---

describe('GET /projects/:id', () => {
  const mockProjectWithOwner = {
    id: 'project-owned',
    name: 'Owned Project',
    ownerId: 'test-user-id', // El usuario de prueba es el propietario
    permissions: [{ userId: 'another-user-id', permission: 'read' }],
    linkAccess: 'none',
    linkToken: null,
    // ... otros campos necesarios
    createdAt: new Date(),
    updatedAt: new Date(),
    isArchived: false,
    versions: [],
  };

  const mockProjectWithCollaboration = {
    id: 'project-collab',
    name: 'Collaborative Project',
    ownerId: 'owner-user-id', // Otro usuario es el propietario
    permissions: [{ userId: 'test-user-id', permission: 'write' }], // El usuario de prueba es colaborador
    linkAccess: 'none',
    linkToken: null,
    // ... otros campos necesarios
    createdAt: new Date(),
    updatedAt: new Date(),
    isArchived: false,
    versions: [],
  };

  const mockProjectForbidden = {
    id: 'project-forbidden',
    name: 'Forbidden Project',
    ownerId: 'owner-user-id', // Otro usuario es el propietario
    permissions: [{ userId: 'another-user-id', permission: 'read' }], // El usuario de prueba NO está aquí
    linkAccess: 'none',
    linkToken: null,
    // ... otros campos necesarios
    createdAt: new Date(),
    updatedAt: new Date(),
    isArchived: false,
    versions: [],
  };
  
  // Limpia los mocks después de cada prueba
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería devolver 200 y el proyecto si el usuario es el propietario', async () => {
    // Configura el mock de Prisma para esta prueba
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectWithOwner);

    const response = await request(app).get('/projects/project-owned');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('project-owned');
    expect(response.body.ownerId).toBe('test-user-id');
    expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-owned' },
        include: { permissions: true, versions: true },
    });
  });

  it('debería devolver 200 y el proyecto si el usuario es colaborador', async () => {
    // Configura el mock de Prisma
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectWithCollaboration);
    
    // Modifica el req.user simulado si es necesario para este test específico
    // (Aunque el mock global ya lo establece a 'test-user-id')

    const response = await request(app).get('/projects/project-collab');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('project-collab');
    // Verifica que el usuario de prueba ('test-user-id') esté en los permisos devueltos
    expect(response.body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'test-user-id' })
      ])
    );
     expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-collab' },
        include: { permissions: true, versions: true },
    });
  });

  it('debería devolver 403 Forbidden si el usuario no es propietario ni colaborador', async () => {
    // Configura el mock de Prisma
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectForbidden);

    const response = await request(app).get('/projects/project-forbidden');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
     expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-forbidden' },
        include: { permissions: true, versions: true },
    });
  });

  it('debería devolver 404 Not Found si el proyecto no existe', async () => {
    // Configura el mock de Prisma para que no encuentre el proyecto
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app).get('/projects/project-nonexistent');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not found');
     expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-nonexistent' },
        include: { permissions: true, versions: true },
    });
  });
  
  // --- Opcional: Pruebas de Acceso por Enlace ---
  
  const mockProjectWithLinkRead = {
      id: 'project-link-read',
      name: 'Link Read Project',
      ownerId: 'owner-user-id', 
      permissions: [], // El usuario de prueba no es colaborador directo
      linkAccess: 'read', // Acceso de lectura por enlace
      linkToken: 'valid-read-token', // Token válido
      createdAt: new Date(),
      updatedAt: new Date(),
      isArchived: false,
      versions: [],
  };

  it('debería devolver 200 si se accede con un token de enlace válido (incluso sin ser owner/collab)', async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectWithLinkRead);

    // Hacemos la petición con el query parameter 'token'
    const response = await request(app).get('/projects/project-link-read?token=valid-read-token');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('project-link-read');
    expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-link-read' },
        include: { permissions: true, versions: true },
    });
  });

  it('debería devolver 403 si se accede con un token de enlace inválido', async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectWithLinkRead); // El proyecto existe y tiene token

    // Hacemos la petición con un token INCORRECTO
    const response = await request(app).get('/projects/project-link-read?token=invalid-token');

    expect(response.status).toBe(403); // Debería ser forbidden porque el token no coincide
    expect(response.body.error).toBe('Forbidden');
     expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-link-read' },
        include: { permissions: true, versions: true },
    });
  });
  
   it('debería devolver 403 si el acceso por enlace está deshabilitado ("none")', async () => {
    const mockProjectLinkNone = { ...mockProjectWithLinkRead, id: 'project-link-none', linkAccess: 'none', linkToken: 'some-token' };
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectLinkNone);

    const response = await request(app).get('/projects/project-link-none?token=some-token');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
     expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-link-none' },
        include: { permissions: true, versions: true },
    });
  });

});

// Puedes añadir más 'describe' blocks para otras rutas (POST, PATCH, DELETE) si es necesario
