// TIPADO GLOBAL: sólo para TypeScript, nunca debe importarse en tiempo de ejecución
/// <reference path="../../types/express/index.d.ts" />
import type { Request as ExpressRequest } from 'express';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../auth/auth.middleware';
import { projectPermissionsRouter } from './permissions.router';
import { projectVersionsRouter } from './versions.router';
import { projectLockingRouter } from './locking.router';

const prisma = new PrismaClient();
const router = Router();

// Zod schemas
const projectCreateSchema = z.object({ name: z.string().min(2), description: z.string().optional() });
const projectUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  isArchived: z.boolean().optional(),
  description: z.string().optional(),
  designData: z.any().optional(), // Permitir designData
});

// Helper: assert user is present (type guard)
function requireUser(req: ExpressRequest): asserts req is ExpressRequest & { user: { id: string } } {
  if (!req.user) throw new Error('User not found in request. Auth middleware missing?');
}

/**
 * @openapi
 * components:
 *   schemas:
 *     Project:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         ownerId:
 *           type: string
 *         isArchived:
 *           type: boolean
 *         designData:
 *           type: object
 *           description: Stores the current design state (e.g., GrapesJS JSON and CSS)
 *           nullable: true
 *         lockedById:
 *           type: string
 *           nullable: true
 *         lockedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         linkAccess:
 *           type: string
 *         linkToken:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         permissions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProjectPermission' # Assuming you define this schema elsewhere
 *         versions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProjectVersion' # Assuming you define this schema elsewhere
 */

/**
 * @openapi
 * /projects:
 *   post:
 *     summary: Crea un nuevo proyecto
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               description:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Proyecto creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Error de validación
 */
router.post('/', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'No userId in request (auth failed)' });
  }

  // *** NUEVA VERIFICACIÓN ***
  // Antes de intentar crear el proyecto, verifica si el usuario del token existe en la BD
  try {
    const ownerExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true } // Solo necesitamos saber si existe, no traer todo el usuario
    });

    if (!ownerExists) {
      console.error(`[Project Create] Error: User ID '${userId}' from token not found in database.`);
      // Devolver un error claro. 404 (Not Found) o 401 (Unauthorized) son opciones.
      // 404 tiene sentido porque el recurso (User) referenciado no se encontró.
      return res.status(404).json({ error: 'Owner user specified in token not found in database.' });
    }
  } catch (dbError) {
      console.error(`[Project Create] Database error verifying owner ID '${userId}':`, dbError);
      return res.status(500).json({ error: 'Database error verifying owner' });
  }
  // *** FIN DE LA NUEVA VERIFICACIÓN ***

  const parse = projectCreateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const { name, description } = parse.data;

  try {
    // Ahora estamos más seguros de que userId existe antes de llamar a create
    const project = await prisma.project.create({
      data: {
        name,
        description,
        ownerId: userId, // Usar el userId verificado
        permissions: {
          create: [{ userId, permission: 'write' }],
        },
      },
      include: { permissions: true },
    });
    res.status(201).json(project);
  } catch (createError) {
      // Si AÚN hay un error de Foreign Key aquí, sería extremadamente raro
      // o indicaría un problema diferente (ej. la FK en permissions).
      console.error(`[Project Create] Error during prisma.project.create for owner '${userId}':`, createError);
      // Devolver un error genérico de servidor si falla la creación por otra razón
      return res.status(500).json({ error: 'Failed to create project due to database error.' });
  }
});

/**
 * @openapi
 * /projects:
 *   get:
 *     summary: Lista todos los proyectos del usuario
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de proyectos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 */
router.get('/', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { permissions: { some: { userId } } },
      ],
    },
    include: { permissions: true },
  });
  res.json(projects);
});

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     summary: Obtiene un proyecto por ID
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proyecto encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
router.get('/:id', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  const linkToken = req.query.token as string | undefined;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { permissions: true, versions: true },
    // Incluimos los campos para acceso por enlace (linkAccess, linkToken)
    // Prisma los incluye por defecto si están en el modelo, pero este comentario lo deja explícito para TypeScript
  }) as (typeof prisma.project extends { findUnique: (args: any) => Promise<infer T> } ? T : any) & { linkAccess?: string; linkToken?: string; permissions: any[]; versions: any[] };
  if (!project) return res.status(404).json({ error: 'Not found' });
  const isOwnerOrCollaborator = project.ownerId === userId || project.permissions.some((p: { userId: string }) => p.userId === userId);
  if (isOwnerOrCollaborator) return res.json(project);
  // Acceso por enlace
  if (
    project.linkAccess !== 'none' &&
    !!linkToken &&
    !!project.linkToken &&
    linkToken === project.linkToken
  ) {
    // Permitir acceso temporal según nivel ('read'/'write')
    // Aquí podrías limitar campos si es solo 'read', o permitir edición si es 'write'.
    // Por simplicidad, devolvemos el proyecto completo.
    return res.json(project);
  }
  return res.status(403).json({ error: 'Forbidden' });
});

/**
 * @openapi
 * /projects/{id}:
 *   patch:
 *     summary: Actualiza un proyecto
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               isArchived:
 *                 type: boolean
 *               description:
 *                 type: string
 *                 nullable: true
 *               designData:
 *                 type: object
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Proyecto actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Error de validación
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
router.patch('/:id', authMiddleware, async (req: ExpressRequest, res) => {
  // --- LOG DE GUARDADO (Backend Inicio) --- 
  console.log(`[Project Router] Received PATCH /projects/${req.params.id}`);
  // ---------------------------------------
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  
  // --- LOG: Body recibido --- 
  console.log('[Project Router] Request body:', JSON.stringify(req.body).substring(0, 200) + '...'); // Loguear parte del body
  // -------------------------
  
  const parse = projectUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    console.error('[Project Router] Validation error:', parse.error.errors);
    return res.status(400).json({ error: parse.error.errors });
  }
  
  const project = await prisma.project.findUnique({ where: { id }, include: { permissions: true } });
  if (!project) {
    console.warn(`[Project Router] Project not found: ${id}`);
    return res.status(404).json({ error: 'Not found' });
  }
  
  const canEdit = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId && p.permission === 'write');
  if (!canEdit) {
    console.warn(`[Project Router] Forbidden access for user ${userId} on project ${id}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // --- LOG antes de actualizar DB --- 
  console.log(`[Project Router] Attempting to update project ${id} with data:`, parse.data);
  // --------------------------------
  
  try {
    const updated = await prisma.project.update({ 
        where: { id }, 
        data: parse.data, 
        include: { permissions: true } 
    });
    // --- LOG después de actualizar DB --- 
    console.log(`[Project Router] Project ${id} updated successfully.`);
    // ---------------------------------
    res.json(updated);
  } catch (dbError: unknown) {
     // --- LOG de error DB --- 
     console.error(`[Project Router] Database error updating project ${id}:`, dbError);
     // ----------------------
     res.status(500).json({ error: 'Database error during update' });
  }
});

/**
 * @openapi
 * /projects/{id}/archive:
 *   patch:
 *     summary: Archiva o desarchiva un proyecto (solo owner)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isArchived:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Proyecto actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
router.patch('/:id/archive', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  const { isArchived } = req.body;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });
  const updated = await prisma.project.update({ where: { id }, data: { isArchived: !!isArchived } });
  res.json(updated);
});

/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     summary: Elimina un proyecto (solo owner)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Proyecto eliminado
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
router.delete('/:id', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });
  // Elimina primero los permisos relacionados
  await prisma.projectPermission.deleteMany({ where: { projectId: id } });
  // Si tienes otras relaciones (versions, locks, etc.), bórralas aquí antes del proyecto
  await prisma.project.delete({ where: { id } });
  res.status(204).send();
});

// Acceso público por enlace
router.get('/link/:token', async (req, res) => {
  const { token } = req.params;
  // Corrige: usa 'linkToken' y 'linkAccess' que sí existen en el modelo
  const project = await prisma.project.findFirst({
    where: {
      linkToken: token,
      linkAccess: { not: 'none' }
    },
    select: {
      id: true,
      name: true,
      description: true,
      linkAccess: true,
      linkToken: true
    },
  });
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json({ project, linkAccess: project.linkAccess });
});

// PATCH /projects/:id/link-access
// Cambia el nivel de acceso por enlace y/o regenera el token (solo owner)
router.patch('/:id/link-access', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  const { linkAccess, regenerate } = req.body as { linkAccess?: 'none' | 'read' | 'write'; regenerate?: boolean };
  // Incluimos los campos para acceso por enlace (linkAccess, linkToken) en el tipado
  const project = await prisma.project.findUnique({ where: { id } }) as (typeof prisma.project extends { findUnique: (args: any) => Promise<infer T> } ? T : any) & { linkAccess?: string; linkToken?: string };
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });
  let newToken = project.linkToken;
  if (regenerate || !project.linkToken) {
    // Genera un nuevo token seguro (24 caracteres)
    newToken = require('crypto').randomBytes(18).toString('hex');
  }
  const updated = await prisma.project.update({
    where: { id },
    data: {
      linkAccess: linkAccess ?? project.linkAccess,
      linkToken: newToken,
    } as any, // Forzamos el tipo para evitar errores de TS
  }) as typeof project;
  res.json({ linkAccess: updated.linkAccess, linkToken: updated.linkToken });
});

// Montar routers secundarios para permisos, versiones y locking
router.use('/:id/permissions', projectPermissionsRouter);
router.use('/:id/versions', projectVersionsRouter);
router.use('/:id/locking', projectLockingRouter);

export const projectRouter = router;
