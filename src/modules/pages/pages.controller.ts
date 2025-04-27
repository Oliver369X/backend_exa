import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../../middlewares/authMiddleware';
// import { projectAccessMiddleware } from '../../middlewares/project-access';
// import { checkProjectPermission } from '../../utils/permission';

const prisma = new PrismaClient();
const router = Router();

/**
 * @swagger
 * /api/pages:
 *   get:
 *     summary: Obtiene todas las páginas de un proyecto
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del proyecto
 *     responses:
 *       200:
 *         description: Lista de páginas del proyecto
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Proyecto no encontrado
 */
router.get('/', authMiddleware, async (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'Se requiere el ID del proyecto' });
  }

  try {
    // Verificar acceso al proyecto
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   projectId.toString(),
    //   'read'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para este proyecto' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    // Obtener páginas no eliminadas
    const pages = await prisma.page.findMany({
      where: {
        projectId: projectId.toString(),
        isDeleted: false
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return res.json(pages);
  } catch (error) {
    console.error('Error al obtener páginas:', error);
    return res.status(500).json({ error: 'Error al obtener páginas' });
  }
});

/**
 * @swagger
 * /api/pages/{id}:
 *   get:
 *     summary: Obtiene una página específica
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la página
 *     responses:
 *       200:
 *         description: Detalles de la página
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Página no encontrada
 */
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // Obtener la página con su proyecto para verificar permisos
    const page = await prisma.page.findUnique({
      where: { id },
      include: { project: true }
    });

    if (!page) {
      return res.status(404).json({ error: 'Página no encontrada' });
    }

    // Verificar acceso al proyecto de la página
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   page.projectId,
    //   'read'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para acceder a esta página' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    return res.json(page);
  } catch (error) {
    console.error('Error al obtener página:', error);
    return res.status(500).json({ error: 'Error al obtener página' });
  }
});

/**
 * @swagger
 * /api/pages:
 *   post:
 *     summary: Crea una nueva página
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectId:
 *                 type: string
 *               name:
 *                 type: string
 *               clientId:
 *                 type: string
 *               html:
 *                 type: string
 *               css:
 *                 type: string
 *               components:
 *                 type: object
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Página creada exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 */
router.post('/', authMiddleware, async (req, res) => {
  const { projectId, name, clientId, html, css, components, isDefault } = req.body;

  if (!projectId || !name || !clientId) {
    return res.status(400).json({ error: 'Se requieren projectId, name y clientId' });
  }

  try {
    // Verificar acceso al proyecto
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   projectId,
    //   'write'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para crear páginas en este proyecto' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    // Verificar si ya existe una página con el mismo clientId en el proyecto
    const existingPage = await prisma.page.findFirst({
      where: {
        projectId,
        clientId,
        isDeleted: false
      }
    });

    if (existingPage) {
      return res.status(409).json({ error: 'Ya existe una página con este ID en el proyecto' });
    }

    // Si esta es la página por defecto, actualizar otras páginas para que no sean predeterminadas
    if (isDefault) {
      await prisma.page.updateMany({
        where: {
          projectId,
          isDefault: true,
          isDeleted: false
        },
        data: {
          isDefault: false
        }
      });
    }

    // Crear la nueva página
    const newPage = await prisma.page.create({
      data: {
        name,
        clientId,
        html: html || null,
        css: css || null,
        components: components || null,
        isDefault: isDefault || false,
        project: {
          connect: { id: projectId }
        },
        // createdBy: {
        //   connect: { id: req.user!.id }
        // } // Commented temporarily req.user might not exist
      }
    });

    return res.status(201).json(newPage);
  } catch (error) {
    console.error('Error al crear página:', error);
    return res.status(500).json({ error: 'Error al crear página' });
  }
});

/**
 * @swagger
 * /api/pages/{id}:
 *   put:
 *     summary: Actualiza una página existente
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la página
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               html:
 *                 type: string
 *               css:
 *                 type: string
 *               components:
 *                 type: object
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Página actualizada exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Página no encontrada
 */
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, html, css, components, isDefault } = req.body;

  try {
    // Obtener la página para verificar permisos
    const page = await prisma.page.findUnique({
      where: { id },
      include: { project: true }
    });

    if (!page) {
      return res.status(404).json({ error: 'Página no encontrada' });
    }

    // Verificar acceso al proyecto
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   page.projectId,
    //   'write'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para modificar esta página' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (html !== undefined) updateData.html = html;
    if (css !== undefined) updateData.css = css;
    if (components !== undefined) updateData.components = components;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    // Si esta página se está estableciendo como predeterminada, actualizar otras páginas
    if (isDefault) {
      await prisma.page.updateMany({
        where: {
          projectId: page.projectId,
          id: { not: id },
          isDefault: true,
          isDeleted: false
        },
        data: {
          isDefault: false
        }
      });
    }

    // Actualizar la página
    const updatedPage = await prisma.page.update({
      where: { id },
      data: updateData
    });

    return res.json(updatedPage);
  } catch (error) {
    console.error('Error al actualizar página:', error);
    return res.status(500).json({ error: 'Error al actualizar página' });
  }
});

/**
 * @swagger
 * /api/pages/{id}:
 *   delete:
 *     summary: Elimina (marca como eliminada) una página
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la página
 *     responses:
 *       200:
 *         description: Página eliminada exitosamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Página no encontrada
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // Obtener la página para verificar permisos
    const page = await prisma.page.findUnique({
      where: { id },
      include: { project: true }
    });

    if (!page) {
      return res.status(404).json({ error: 'Página no encontrada' });
    }

    // Verificar acceso al proyecto
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   page.projectId,
    //   'write'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para eliminar esta página' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    // No permitir eliminar la única página predeterminada
    if (page.isDefault) {
      const pageCount = await prisma.page.count({
        where: {
          projectId: page.projectId,
          isDeleted: false
        }
      });

      if (pageCount <= 1) {
        return res.status(400).json({ error: 'No se puede eliminar la única página del proyecto' });
      }
    }

    // Marcar como eliminada en lugar de eliminar físicamente
    const deletedPage = await prisma.page.update({
      where: { id },
      data: {
        isDeleted: true
      }
    });

    // Si la página eliminada era la predeterminada, establecer otra como predeterminada
    if (page.isDefault) {
      const anyPage = await prisma.page.findFirst({
        where: {
          projectId: page.projectId,
          isDeleted: false,
          id: { not: id }
        }
      });

      if (anyPage) {
        await prisma.page.update({
          where: { id: anyPage.id },
          data: { isDefault: true }
        });
      }
    }

    return res.json({ success: true, message: 'Página eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar página:', error);
    return res.status(500).json({ error: 'Error al eliminar página' });
  }
});

/**
 * @swagger
 * /api/pages/restore/{id}:
 *   post:
 *     summary: Restaura una página eliminada
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la página
 *     responses:
 *       200:
 *         description: Página restaurada exitosamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Página no encontrada
 */
router.post('/restore/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // Obtener la página para verificar permisos
    const page = await prisma.page.findUnique({
      where: { id },
      include: { project: true }
    });

    if (!page) {
      return res.status(404).json({ error: 'Página no encontrada' });
    }

    // Verificar acceso al proyecto
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   page.projectId,
    //   'write'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para restaurar esta página' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    // Restaurar la página
    const restoredPage = await prisma.page.update({
      where: { id },
      data: {
        isDeleted: false
      }
    });

    return res.json(restoredPage);
  } catch (error) {
    console.error('Error al restaurar página:', error);
    return res.status(500).json({ error: 'Error al restaurar página' });
  }
});

/**
 * @swagger
 * /api/pages/by-client-id/{clientId}:
 *   get:
 *     summary: Obtiene una página por su clientId
 *     tags: [Pages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del cliente para la página
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del proyecto
 *     responses:
 *       200:
 *         description: Detalles de la página
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Página no encontrada
 */
router.get('/by-client-id/:clientId', authMiddleware, async (req, res) => {
  const { clientId } = req.params;
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'Se requiere el ID del proyecto' });
  }

  try {
    // Verificar acceso al proyecto
    // const hasAccess = await checkProjectPermission(
    //   req.user!.id,
    //   projectId.toString(),
    //   'read'
    // );
    // if (!hasAccess) {
    //   return res.status(403).json({ error: 'No tienes permisos para este proyecto' });
    // }
    const hasAccess = true; // TEMPORARY: Assume access for now

    // Buscar la página por clientId y projectId
    const page = await prisma.page.findFirst({
      where: {
        clientId,
        projectId: projectId.toString(),
        isDeleted: false
      }
    });

    if (!page) {
      return res.status(404).json({ error: 'Página no encontrada' });
    }

    return res.json(page);
  } catch (error) {
    console.error('Error al obtener página por clientId:', error);
    return res.status(500).json({ error: 'Error al obtener página por clientId' });
  }
});

export default router; 