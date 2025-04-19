import { Router, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../auth/auth.middleware';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// Helper: assert user is present (type guard)
function requireUser(req: Request): asserts req is Request & { user: { id: string } } {
  if (!req.user) throw new Error('User not found in request. Auth middleware missing?');
}

// Lock project
router.post('/lock', authMiddleware, async (req, res) => {
  requireUser(req);
  const { id: projectId } = req.params;
  const userId = req.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const canWrite = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId && p.permission === 'write');
  if (!canWrite) return res.status(403).json({ error: 'Forbidden' });
  if (project.lockedById && project.lockedById !== userId) {
    return res.status(409).json({ error: 'Project is already locked by another user' });
  }
  await prisma.project.update({ where: { id: projectId }, data: { lockedById: userId, lockedAt: new Date() } });
  res.json({ isLocked: true });
});

// Unlock project
router.post('/unlock', authMiddleware, async (req, res) => {
  requireUser(req);
  const { id: projectId } = req.params;
  const userId = req.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { permissions: true } });
  if (!project) return res.status(404).json({ error: 'Not found' });
  const canWrite = project.ownerId === userId || project.permissions.some((p: { userId: string, permission: string }) => p.userId === userId && p.permission === 'write');
  if (!canWrite) return res.status(403).json({ error: 'Forbidden' });
  if (!project.lockedById || project.lockedById !== userId) {
    return res.status(409).json({ error: 'You do not hold the lock' });
  }
  await prisma.project.update({ where: { id: projectId }, data: { lockedById: null, lockedAt: null } });
  res.json({ isLocked: false });
});

export const projectLockingRouter = router;
