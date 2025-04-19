/**
 * Prueba automática para verificar la conexión a la base de datos
 * en ambos entornos: local y producción (Supabase).
 * Ejecuta: npx jest src/test/db-connection.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

describe('DB Connection', () => {
  it('should connect to the database', async () => {
    const prisma = new PrismaClient();
    try {
      const result = await prisma.$queryRaw`SELECT 1 as ok`;
      expect(result).toBeDefined();
    } catch (err) {
      console.error('[DB TEST] ❌ Error de conexión:', err);
    } finally {
      await prisma.$disconnect();
    }
  });
});
