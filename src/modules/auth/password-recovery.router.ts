import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const router = Router();

const recoverySchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string(), password: z.string().min(6) });

/**
 * @openapi
 * /auth/recover:
 *   post:
 *     summary: Solicita recuperación de contraseña (token)
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Token de recuperación generado
 *       400:
 *         description: Error de validación
 *       404:
 *         description: Usuario no encontrado
 */
// POST /auth/recover - send recovery token (mock: logs token)
router.post('/recover', async (req, res) => {
  const parse = recoverySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const { email } = parse.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { email }, data: { passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 3600 * 1000) } });
  // In a real app, send this token by email. For now, return it for testing.
  res.json({ message: 'Recovery token generated', token });
});

/**
 * @openapi
 * /auth/reset:
 *   post:
 *     summary: Restablece la contraseña usando el token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Contraseña restablecida
 *       400:
 *         description: Token inválido o expirado
 */
// POST /auth/reset - reset password with token
router.post('/reset', async (req, res) => {
  const parse = resetSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors });
  const { token, password } = parse.data;
  const user = await prisma.user.findFirst({ where: { passwordResetToken: token, passwordResetExpires: { gt: new Date() } } });
  if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
  const hash = await import('bcryptjs').then(b => b.hash(password, 10));
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, passwordResetToken: null, passwordResetExpires: null } });
  res.json({ message: 'Password reset successful' });
});

export const passwordRecoveryRouter = router;
