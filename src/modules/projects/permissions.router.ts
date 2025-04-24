/// <reference path="../../types/express/index.d.ts" />
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../auth/auth.middleware';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// Esquema Zod para añadir/actualizar permiso (AHORA USA EMAIL)
const permissionAddSchema = z.object({
  email: z.string().email(), // Cambiado de userId a email
  permission: z.enum(['read', 'write'])
});

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
 *               email:       # Cambiado de userId a email
 *                 type: string
 *                 format: email
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
  const ownerUserId = req.user.id; // ID del usuario que hace la petición (debe ser owner)

  // 1. Validar el cuerpo de la petición usando el nuevo esquema
  const parse = permissionAddSchema.safeParse(req.body);
  if (!parse.success) {
    console.error('Validation Error:', parse.error.errors);
    return res.status(400).json({ error: 'Invalid request body', details: parse.error.errors });
  }
  const { email: targetEmail, permission } = parse.data;

  // 2. Verificar que quien hace la petición es el dueño del proyecto
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (project.ownerId !== ownerUserId) {
    return res.status(403).json({ error: 'Forbidden: Only the project owner can manage permissions' });
  }

  // 3. Buscar al usuario colaborador por su email
  let targetUser;
  try {
    targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
  } catch (dbError) {
    console.error('Database error finding target user:', dbError);
    return res.status(500).json({ error: 'Database error checking user' });
  }

  if (!targetUser) {
    return res.status(404).json({ error: `User with email ${targetEmail} not found` });
  }
  const targetUserId = targetUser.id;

  // Evitar que el dueño se añada/modifique a sí mismo a través de esta ruta
  if (targetUserId === ownerUserId) {
      return res.status(400).json({ error: 'Cannot manage owner permissions through this route' });
  }

  // 4. Crear o actualizar (Upsert) el permiso para el targetUserId encontrado
  try {
    const updatedPermission = await prisma.projectPermission.upsert({
      where: { projectId_userId: { projectId, userId: targetUserId } }, // Clave única compuesta
      update: { permission }, // Qué actualizar si existe
      create: { projectId, userId: targetUserId, permission }, // Qué crear si no existe
    });
    // Responder con el permiso creado/actualizado
    res.status(200).json({ userId: updatedPermission.userId, permission: updatedPermission.permission });
  } catch (dbError) {
    console.error('Database error upserting permission:', dbError);
    // Podría ser un error de constraint si algo va mal
    return res.status(500).json({ error: 'Database error saving permission' });
  }
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
