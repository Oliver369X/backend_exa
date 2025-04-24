/**
 * Socket.IO Collaboration Server
 * 
 * Este módulo implementa un servidor de Socket.IO para colaboración en tiempo real
 * entre usuarios que trabajan en el mismo proyecto. Maneja autenticación, autorización
 * y sincronización de eventos.
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// Cliente de Prisma para acceder a la base de datos
const prisma = new PrismaClient();

// Función simple de logging
const log = {
  info: (message: string, meta?: any) => console.log(`[INFO] ${message}`, meta || ''),
  debug: (message: string, meta?: any) => console.log(`[DEBUG] ${message}`, meta || ''),
  warn: (message: string, meta?: any) => console.warn(`[WARN] ${message}`, meta || ''),
  error: (message: string, meta?: any) => console.error(`[ERROR] ${message}`, meta || '')
};

// Tipos para mejorar la seguridad de tipos
interface UserPayload {
  id: string;
  email: string;
  name: string;
}

interface SocketWithUser extends Socket {
  user?: UserPayload;
  projectId?: string;
}

// Mapa para rastrear usuarios activos por proyecto
const activeUsers = new Map<string, Map<string, { id: string; name: string }>>();

/**
 * Inicializa el servidor de Socket.IO para colaboración
 * @param httpServer - Servidor HTTP para adjuntar Socket.IO
 * @param app - Aplicación Express
 */
export function setupCollabSocket(httpServer: HttpServer, app: any): void {
  log.info('Inicializando servidor de colaboración Socket.IO');
  
  // Crear instancia de Socket.IO con configuración CORS
  const io = new Server(httpServer, {
    path: '/socket.io/collab',
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000'|| 'http://localhost:3001',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  // Middleware de autenticación
  io.use(async (socket: SocketWithUser, next) => {
    try {
      log.info('Nueva conexión de socket entrante');
      
      // Obtener token de autenticación
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      log.debug('Token recibido:', { token: token ? 'presente' : 'ausente' });
      
      // Obtener ID del proyecto
      const projectId = socket.handshake.query?.projectId as string;
      log.debug('ID de proyecto recibido:', { projectId });
      
      // Validar token y projectId
      if (!token) {
        log.warn('Conexión rechazada: Token no proporcionado');
        return next(new Error('No se proporcionó token de autenticación'));
      }
      
      if (!projectId) {
        log.warn('Conexión rechazada: ID de proyecto no proporcionado');
        return next(new Error('No se proporcionó ID de proyecto'));
      }
      
      // Verificar token JWT
      const secret = process.env.JWT_SECRET!;
      const user = jwt.verify(token as string, secret) as UserPayload;
      log.info('Usuario autenticado:', { userId: user.id, name: user.name });
      
      // Verificar acceso al proyecto
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      
      if (!project) {
        log.warn('Conexión rechazada: Proyecto no encontrado', { projectId });
        return next(new Error('Proyecto no encontrado'));
      }
      
      // Buscar permisos del usuario para este proyecto
      const projectPermission = await prisma.projectPermission.findFirst({
        where: {
          projectId,
          userId: user.id
        }
      });
      
      // Verificar permisos (propietario o colaborador)
      const isOwner = project.ownerId === user.id;
      const isCollaborator = !!projectPermission;
      const hasLinkAccess = project.linkAccess !== 'none';
      
      if (!isOwner && !isCollaborator && !hasLinkAccess) {
        log.warn('Conexión rechazada: Sin permisos para el proyecto', { 
          userId: user.id, 
          projectId,
          isOwner,
          isCollaborator,
          linkAccess: project.linkAccess
        });
        return next(new Error('Sin permisos para acceder a este proyecto'));
      }
      
      // Adjuntar datos de usuario y proyecto al socket
      socket.user = user;
      socket.projectId = projectId;
      
      log.info('Autenticación de socket exitosa', { 
        userId: user.id, 
        projectId, 
        isOwner 
      });
      next();
    } catch (error) {
      log.error('Error en autenticación de socket:', error);
      next(new Error('Error de autenticación'));
    }
  });
  
  // Manejo de conexiones
  io.on('connection', (socket: SocketWithUser) => {
    const user = socket.user!;
    const projectId = socket.projectId!;
    
    log.info('Cliente conectado', { 
      socketId: socket.id, 
      userId: user.id, 
      projectId 
    });
    
    // Evento: Usuario se une al proyecto
    socket.on('user-join', () => {
      log.info('Evento user-join recibido', { userId: user.id, projectId });
      // Registrar usuario activo
      if (!activeUsers.has(projectId)) {
        activeUsers.set(projectId, new Map());
      }
      
      activeUsers.get(projectId)!.set(user.id, {
        id: user.id,
        name: user.name
      });
      
      // Unirse a la sala del proyecto
      socket.join(projectId);
      log.info('Socket unido a la sala', { socketId: socket.id, room: projectId });
      
      // Registrar usuario activo y notificar presencia (código movido aquí para asegurar que se une a la sala)
      const usersInProject = Array.from(activeUsers.get(projectId)!.values());
      io.to(projectId).emit('presence-update', usersInProject);
      log.debug('Actualización de presencia emitida', { projectId, activeCount: usersInProject.length });
    });
    
    // Evento: Usuario abandona el proyecto
    socket.on('user-leave', () => {
      handleUserLeave(socket);
    });
    
    // Evento: Actualización completa del editor
    socket.on('editor:full-update', (fullUpdateData) => { 
      // fullUpdateData debería ser { components: GrapesJSComponent[], styles: string }
      log.debug('Evento editor:full-update RECIBIDO', { 
        userId: user.id, 
        projectId,
        hasComponents: !!fullUpdateData?.components,
        hasStyles: !!fullUpdateData?.styles
      });
      
      // Retransmitir la actualización completa a los demás en la sala
      socket.to(projectId).emit('editor:full-update', {
        userId: user.id,
        userName: user.name,
        data: fullUpdateData, // Enviar el objeto completo recibido
        timestamp: Date.now()
      });
      log.debug('Evento editor:full-update RETRANSMITIDO a la sala', { projectId, fromUserId: user.id });
    });
    
    // Evento: Mensaje de chat
    socket.on('chat:message', (data) => {
      log.info('Mensaje de chat recibido', { 
        userId: user.id, 
        projectId,
        message: data.message?.substring(0, 20) + (data.message?.length > 20 ? '...' : '')
      });
      
      // Reenviar mensaje a todos los usuarios en el proyecto
      io.to(projectId).emit('chat:message', {
        userId: user.id,
        userName: user.name,
        message: data.message,
        timestamp: data.timestamp || Date.now()
      });
    });
    
    // Evento: Desconexión
    socket.on('disconnect', () => {
      log.info('Cliente desconectado', { 
        socketId: socket.id, 
        userId: user.id, 
        projectId 
      });
      
      handleUserLeave(socket);
    });
    
    // Función auxiliar para manejar la salida de usuarios
    function handleUserLeave(socket: SocketWithUser) {
      const user = socket.user!;
      const projectId = socket.projectId!;
      
      if (activeUsers.has(projectId)) {
        // Eliminar usuario de la lista de activos
        activeUsers.get(projectId)!.delete(user.id);
        
        // Si no quedan usuarios activos, limpiar el proyecto
        if (activeUsers.get(projectId)!.size === 0) {
          activeUsers.delete(projectId);
          log.debug('Proyecto sin usuarios activos, eliminado del seguimiento', { projectId });
        } else {
          // Notificar a los usuarios restantes
          const usersInProject = Array.from(activeUsers.get(projectId)!.values());
          io.to(projectId).emit('presence-update', usersInProject);
          
          log.debug('Usuarios activos actualizados tras salida', { 
            projectId, 
            activeCount: usersInProject.length 
          });
        }
      }
      
      // Abandonar la sala del proyecto
      socket.leave(projectId);
    }
  });
  
  log.info('Servidor de colaboración Socket.IO inicializado correctamente');
}
