import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../auth/auth.middleware';

const prisma = new PrismaClient();
const router = Router();

/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Obtiene el perfil del usuario autenticado
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil de usuario
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/me', authMiddleware, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });
});

export const userRouter = router;
