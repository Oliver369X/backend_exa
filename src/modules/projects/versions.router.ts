import { Router, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../auth/auth.middleware';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

const versionCreateSchema = z.object({ comment: z.string().optional(), snapshot: z.any() });

// Helper: assert user is present (type guard)
function requireUser(req: Request): asserts req is Request & { user: { id: string } } {
  if (!req.user) throw new Error('User not found in request. Auth middleware missing?');
}

// List versions
router.get('/', authMiddleware, async (req, res) => {
  requireUser(req);
  const { id: projectId } = req.params;
  const userId = req.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const hasAccess = project.ownerId === userId || project.permissions.some((p: { userId: string }) => p.userId === userId);
  if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  const versions = await prisma.projectVersion.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  res.status(200).json(versions);
});

// Create version
router.post('/', authMiddleware, async (req, res) => {
  requireUser(req);
  const { id: projectId } = req.params;
  const userId = req.user.id;
  const parse = versionCreateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const { comment, snapshot } = parse.data;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const canWrite = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId && p.permission === 'write');
  if (!canWrite) return res.status(403).json({ error: 'Forbidden' });
  const version = await prisma.projectVersion.create({ data: { projectId, createdById: userId, comment, snapshot } });
  res.status(201).json({ id: version.id, projectId: version.projectId, snapshot: version.snapshot });
});

// Get version by id
router.get('/:versionId', authMiddleware, async (req, res) => {
  requireUser(req);
  const { id: projectId, versionId } = req.params;
  const userId = req.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const hasAccess = project.ownerId === userId || project.permissions.some((p: { userId: string }) => p.userId === userId);
  if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  const version = await prisma.projectVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) return res.status(404).json({ error: 'Version not found' });
  res.status(200).json(version);
});

// Restore version (creates a new version as a copy)
router.post('/:versionId/restore', authMiddleware, async (req, res) => {
  requireUser(req);
  const { id: projectId, versionId } = req.params;
  const userId = req.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const canWrite = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId && p.permission === 'write');
  if (!canWrite) return res.status(403).json({ error: 'Forbidden' });
  const version = await prisma.projectVersion.findUnique({ where: { id: versionId } });
  if (!version || String(version.projectId) !== String(projectId)) return res.status(404).json({ error: 'Version not found' });
  const restored = await prisma.projectVersion.create({
    data: {
      projectId,
      createdById: userId,
      comment: `Restored from version ${versionId}`,
      snapshot: version.snapshot as any,
    },
  });
  // Respuesta estándar para el frontend/test
  res.status(201).json({ snapshot: restored.snapshot });
});

export const projectVersionsRouter = router;
