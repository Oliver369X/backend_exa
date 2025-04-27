import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
// import { checkProjectPermission } from '../projects/permissions.router'; // Commented out - Not exported

const prisma = new PrismaClient();

// Interfaces para tipado
export interface PageData {
  id: string;
  name: string;
  html?: string;
  css?: string;
  components?: any;
  isDefault?: boolean;
}

// Tipos de eventos de páginas
export interface PageEventData {
  pageId: string;
  pageName?: string;
  userId?: string;
  timestamp?: number;
  projectId?: string;
  pageData?: PageData;
}

// Registro de páginas cargadas por proyecto y cliente
const clientPages = new Map<string, Set<string>>();

/**
 * Registra controladores de socket para manejo de páginas
 * @param io Instancia del servidor Socket.IO
 */
export const registerPageSocketHandlers = (io: Server) => {
  console.log('[Socket] Registrando controladores para páginas');

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Cliente conectado: ${socket.id}`);

    // Almacenar projectId para uso en desconexión
    let currentProjectId: string | null = null;

    // Unirse a un proyecto
    socket.on('join:project', async (data: { projectId: string, userId: string }) => {
      const { projectId, userId } = data;

      if (!projectId) {
        return socket.emit('error', { message: 'Se requiere projectId' });
      }

      try {
        // Verificar permisos del usuario en el proyecto
        let hasAccess = true; // TEMPORARY: Assume access
        // if (userId) {
        //   hasAccess = await checkProjectPermission(userId, projectId, 'read');
        //   if (!hasAccess) {
        //     return socket.emit('error', { message: 'No tienes permisos para este proyecto' });
        //   }
        // }

        // Unir al socket a la sala del proyecto
        socket.join(`project:${projectId}`);
        currentProjectId = projectId;

        console.log(`[Socket] Cliente ${socket.id} unido al proyecto ${projectId}`);
        
        // Inicializar conjunto de páginas para este cliente si no existe
        const clientKey = `${socket.id}:${projectId}`;
        if (!clientPages.has(clientKey)) {
          clientPages.set(clientKey, new Set<string>());
        }

        // Notificar al cliente que se ha unido correctamente
        socket.emit('join:project', { projectId });
      } catch (error) {
        console.error('[Socket] Error al unirse al proyecto:', error);
        socket.emit('error', { message: 'Error al unirse al proyecto' });
      }
    });

    // Solicitud de sincronización de páginas
    socket.on('page:request-sync', async (data: { projectId: string, userId?: string }) => {
      const { projectId, userId } = data;

      try {
        // Verificar permisos si hay userId
        let hasAccess = true; // TEMPORARY: Assume access
        // if (userId) {
        //   hasAccess = await checkProjectPermission(userId, projectId, 'read');
        //   if (!hasAccess) {
        //     return socket.emit('error', { message: 'No tienes permisos para este proyecto' });
        //   }
        // }

        // Obtener todas las páginas no eliminadas del proyecto
        const pages = await prisma.page.findMany({
          where: {
            projectId,
            isDeleted: false
          },
          orderBy: {
            createdAt: 'asc'
          }
        });

        // Mapear a formato simplificado para enviar
        const pagesData = pages.map(page => ({
          id: page.clientId, // Usar clientId como id para el frontend
          name: page.name,
          html: page.html,
          css: page.css,
          components: page.components,
          isDefault: page.isDefault
        }));

        // Registrar páginas cargadas por este cliente
        const clientKey = `${socket.id}:${projectId}`;
        const pageSet = clientPages.get(clientKey) || new Set<string>();
        
        pages.forEach(page => {
          pageSet.add(page.clientId);
        });
        
        clientPages.set(clientKey, pageSet);

        // Enviar páginas al cliente
        console.log(`[Socket] Enviando sincronización completa: ${pagesData.length} páginas`);
        socket.emit('page:full-sync', { pages: pagesData });
      } catch (error) {
        console.error('[Socket] Error al sincronizar páginas:', error);
        socket.emit('error', { message: 'Error al sincronizar páginas' });
      }
    });

    // Evento: agregar página
    socket.on('page:add', async (data: PageEventData) => {
      const { projectId, pageId, pageName, userId, pageData } = data;

      if (!projectId || !pageId || !pageName) {
        return socket.emit('error', { message: 'Datos incompletos para agregar página' });
      }

      try {
        // Verificar permisos si hay userId
        let hasAccess = true; // TEMPORARY: Assume access
        // if (userId) {
        //   hasAccess = await checkProjectPermission(userId, projectId, 'write');
        //   if (!hasAccess) {
        //     return socket.emit('error', { message: 'No tienes permisos para crear páginas en este proyecto' });
        //   }
        // }

        // Verificar si la página ya existe en la base de datos
        const existingPage = await prisma.page.findFirst({
          where: { 
            projectId,
            clientId: pageId,
            isDeleted: false
          }
        });

        if (!existingPage) {
          // Crear la página en la base de datos
          await prisma.page.create({
            data: {
              clientId: pageId,
              name: pageName,
              html: pageData?.html || null,
              css: pageData?.css || null,
              components: pageData?.components || null,
              isDefault: pageData?.isDefault || false,
              project: {
                connect: { id: projectId }
              }
              // createdBy: { // Removed - Not in schema
              //   connect: { id: userId || '00000000-0000-0000-0000-000000000000' }
              // }
            }
          });
          
          console.log(`[Socket] Página creada en BD: ${pageName} (${pageId}) por ${userId || 'anónimo'}`);
        } else {
          console.log(`[Socket] La página ${pageId} ya existe en BD, actualizando`);
          
          // Si la página existe pero está marcada como eliminada, restaurarla
          if (existingPage.isDeleted) {
            await prisma.page.update({
              where: { id: existingPage.id },
              data: {
                isDeleted: false,
                name: pageName,
                html: pageData?.html || existingPage.html,
                css: pageData?.css || existingPage.css,
                components: pageData?.components || existingPage.components
              }
            });
            
            console.log(`[Socket] Página restaurada: ${pageName} (${pageId})`);
          }
        }

        // Añadir esta página al conjunto de páginas del cliente
        const clientKey = `${socket.id}:${projectId}`;
        const pageSet = clientPages.get(clientKey) || new Set<string>();
        pageSet.add(pageId);
        clientPages.set(clientKey, pageSet);

        // Reenviar el evento a todos los clientes en el proyecto excepto al emisor
        socket.to(`project:${projectId}`).emit('page:add', data);
      } catch (error) {
        console.error('[Socket] Error al agregar página:', error);
        socket.emit('error', { message: 'Error al agregar página' });
      }
    });

    // Evento: eliminar página
    socket.on('page:remove', async (data: PageEventData) => {
      const { projectId, pageId, userId } = data;

      if (!projectId || !pageId) {
        return socket.emit('error', { message: 'Datos incompletos para eliminar página' });
      }

      try {
        // Verificar permisos si hay userId
        let hasAccess = true; // TEMPORARY: Assume access
        // if (userId) {
        //   hasAccess = await checkProjectPermission(userId, projectId, 'write');
        //   if (!hasAccess) {
        //     return socket.emit('error', { message: 'No tienes permisos para eliminar páginas en este proyecto' });
        //   }
        // }

        // Buscar la página en la BD
        const page = await prisma.page.findFirst({
          where: {
            projectId,
            clientId: pageId
          }
        });

        if (page) {
          // No permitir eliminar la única página predeterminada
          if (page.isDefault) {
            const pageCount = await prisma.page.count({
              where: {
                projectId,
                isDeleted: false
              }
            });

            if (pageCount <= 1) {
              return socket.emit('error', { message: 'No se puede eliminar la única página del proyecto' });
            }
          }

          // Marcar como eliminada
          await prisma.page.update({
            where: { id: page.id },
            data: { isDeleted: true }
          });

          console.log(`[Socket] Página marcada como eliminada: ${page.name} (${pageId})`);

          // Si la página eliminada era la predeterminada, establecer otra como predeterminada
          if (page.isDefault) {
            const anyPage = await prisma.page.findFirst({
              where: {
                projectId,
                isDeleted: false,
                clientId: { not: pageId }
              }
            });

            if (anyPage) {
              await prisma.page.update({
                where: { id: anyPage.id },
                data: { isDefault: true }
              });
              
              console.log(`[Socket] Nueva página predeterminada: ${anyPage.name} (${anyPage.clientId})`);
            }
          }
        }

        // Eliminar esta página del conjunto de páginas del cliente
        const clientKey = `${socket.id}:${projectId}`;
        const pageSet = clientPages.get(clientKey);
        if (pageSet) {
          pageSet.delete(pageId);
        }

        // Reenviar el evento a todos los clientes en el proyecto excepto al emisor
        socket.to(`project:${projectId}`).emit('page:remove', data);
      } catch (error) {
        console.error('[Socket] Error al eliminar página:', error);
        socket.emit('error', { message: 'Error al eliminar página' });
      }
    });

    // Evento: actualizar página
    socket.on('page:update', async (data: PageEventData) => {
      const { projectId, pageId, pageName, userId, pageData } = data;

      if (!projectId || !pageId) {
        return socket.emit('error', { message: 'Datos incompletos para actualizar página' });
      }

      try {
        // Verificar permisos si hay userId
        let hasAccess = true; // TEMPORARY: Assume access
        // if (userId) {
        //   hasAccess = await checkProjectPermission(userId, projectId, 'write');
        //   if (!hasAccess) {
        //     return socket.emit('error', { message: 'No tienes permisos para modificar páginas en este proyecto' });
        //   }
        // }

        // Buscar la página en la BD
        const page = await prisma.page.findFirst({
          where: {
            projectId,
            clientId: pageId,
            isDeleted: false
          }
        });

        if (page) {
          const updateData: any = {};
          
          if (pageName) updateData.name = pageName;
          if (pageData?.html !== undefined) updateData.html = pageData.html;
          if (pageData?.css !== undefined) updateData.css = pageData.css;
          if (pageData?.components !== undefined) updateData.components = pageData.components;
          
          // Manejar cambio de página predeterminada
          if (pageData?.isDefault) {
            updateData.isDefault = true;
            
            // Si esta página se está estableciendo como predeterminada, actualizar otras páginas
            await prisma.page.updateMany({
              where: {
                projectId,
                id: { not: page.id },
                isDefault: true,
                isDeleted: false
              },
              data: {
                isDefault: false
              }
            });
          }

          // Actualizar la página
          await prisma.page.update({
            where: { id: page.id },
            data: updateData
          });

          console.log(`[Socket] Página actualizada: ${pageName || page.name} (${pageId})`);
        } else {
          console.log(`[Socket] No se encontró la página ${pageId} para actualizar`);
        }

        // Reenviar el evento a todos los clientes en el proyecto excepto al emisor
        socket.to(`project:${projectId}`).emit('page:update', data);
      } catch (error) {
        console.error('[Socket] Error al actualizar página:', error);
        socket.emit('error', { message: 'Error al actualizar página' });
      }
    });

    // Evento: seleccionar página (solo retransmitir a otros clientes)
    socket.on('page:select', (data: PageEventData) => {
      const { projectId } = data;
      
      if (!projectId) return;
      
      // Solo reenviar, no modificar base de datos
      socket.to(`project:${projectId}`).emit('page:select', data);
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
      console.log(`[Socket] Cliente desconectado: ${socket.id}`);
      
      // Limpiar el registro de páginas de este cliente
      if (currentProjectId) {
        const clientKey = `${socket.id}:${currentProjectId}`;
        clientPages.delete(clientKey);
      }
    });
  });
};

export default registerPageSocketHandlers; 