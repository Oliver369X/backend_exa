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
const projectUpdateSchema = z.object({ name: z.string().min(2).optional(), isArchived: z.boolean().optional(), description: z.string().optional() });

// Helper: assert user is present (type guard)
function requireUser(req: ExpressRequest): asserts req is ExpressRequest & { user: { id: string } } {
  if (!req.user) throw new Error('User not found in request. Auth middleware missing?');
}

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
 *       400:
 *         description: Error de validación
 */
router.post('/', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'No userId in request (auth failed)' });
  }
  const parse = projectCreateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const { name, description } = parse.data;
  // Use correct Prisma model: 'project' should be 'project' (lowercase) as per PrismaClient
  // All usages are correct if your schema.prisma has 'model Project' (not 'Projects')
  // If your PrismaClient is missing 'project', regenerate with `npx prisma generate`
  // If still missing, check for typos in schema or model name
  // No code change needed if model is correct
  const project = await prisma.project.create({
    data: {
      name,
      description,
      ownerId: userId,
      permissions: {
        create: [{ userId, permission: 'write' }],
      },
    },
    include: { permissions: true },
  });
  res.status(201).json(project);
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
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
router.get('/:id', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { permissions: true, versions: true },
  });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const hasAccess = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId);
  if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  res.json(project);
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
 *     responses:
 *       200:
 *         description: Proyecto actualizado
 *       400:
 *         description: Error de validación
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
router.patch('/:id', authMiddleware, async (req: ExpressRequest, res) => {
  requireUser(req);
  const userId = req.user.id;
  const { id } = req.params;
  const parse = projectUpdateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const project = await prisma.project.findUnique({ where: { id }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const canEdit = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId && p.permission === 'write');
  if (!canEdit) return res.status(403).json({ error: 'Forbidden' });
  const updated = await prisma.project.update({ where: { id }, data: parse.data, include: { permissions: true } });
  res.json(updated);
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

router.use('/:id/permissions', projectPermissionsRouter);
router.use('/:id/versions', projectVersionsRouter);
router.use('/:id/locking', projectLockingRouter);

export const projectRouter = router;
