/// <reference path="../../types/express/index.d.ts" />
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../auth/auth.middleware';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

const permissionSchema = z.object({ userId: z.string().uuid(), permission: z.enum(['read', 'write']) });

// Helper: assert user is present (type guard)
function requireUser(req: Request): asserts req is Request & { user: { id: string } } {
  if (!req.user) throw new Error('User not found in request. Auth middleware missing?');
}

/**
 * @openapi
 * /api/projects/{id}/permissions:
 *   post:
 *     summary: Agrega o actualiza un permiso de usuario en un proyecto (solo owner)
 *     tags:
 *       - Project Permissions
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
 *               userId:
 *                 type: string
 *               permission:
 *                 type: string
 *                 enum: [read, write]
 *     responses:
 *       200:
 *         description: Permiso actualizado
 *       400:
 *         description: Error de validación
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
// Add or update permission
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  requireUser(req);
  const { id: projectId } = req.params;
  const userId = req.user.id;
  const parse = permissionSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const { userId: targetUserId, permission } = parse.data;
  // Only owner can manage permissions
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });
  // Upsert permission
  const updated = await prisma.projectPermission.upsert({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    update: { permission },
    create: { projectId, userId: targetUserId, permission },
  });
  // Respuesta estándar para el frontend/test
  res.status(200).json({ userId: updated.userId, permission: updated.permission });
});

/**
 * @openapi
 * /api/projects/{id}/permissions:
 *   get:
 *     summary: Lista todos los permisos del proyecto
 *     tags:
 *       - Project Permissions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de permisos
 *       404:
 *         description: No encontrado
 */
// GET /projects/:id/permissions - lista todos los permisos del proyecto
router.get('/', async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  // Busca el proyecto y sus permisos
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project.permissions ?? []);
});

/**
 * @openapi
 * /api/projects/{id}/permissions/{userId}:
 *   delete:
 *     summary: Elimina el permiso de un usuario en un proyecto (solo owner)
 *     tags:
 *       - Project Permissions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Permiso eliminado
 *       404:
 *         description: No encontrado
 *       403:
 *         description: Prohibido
 */
// Remove permission
router.delete('/:userId', authMiddleware, async (req: Request, res: Response) => {
  requireUser(req);
  const { id: projectId, userId: targetUserId } = req.params;
  const userId = req.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });
  await prisma.projectPermission.deleteMany({ where: { projectId, userId: targetUserId } });
  res.status(204).send();
});

export const projectPermissionsRouter = router;
