# Documentación Técnica – API de Backend

## Estructura General
- **Framework:** Express + TypeScript
- **ORM:** Prisma
- **Validación:** Zod
- **Autenticación:** JWT (Bearer)

## Modelos (Prisma)
- **User**: Usuarios del sistema
- **Project**: Proyectos creados por usuarios
- **ProjectPermission**: Permisos de usuario sobre proyectos ('read', 'write')
- **ProjectVersion**: Versiones y snapshots de proyectos

## Endpoints Principales

### Autenticación
- `POST /auth/register` – Registro de usuario
- `POST /auth/login` – Login de usuario
- `POST /auth/recover` – Recuperación de contraseña

### Proyectos
- `GET /projects` – Listar proyectos propios o con permiso
- `POST /projects` – Crear proyecto
- `GET /projects/:id` – Obtener proyecto por ID
- `PATCH /projects/:id` – Actualizar proyecto
- `PATCH /projects/:id/archive` – Archivar/desarchivar
- `DELETE /projects/:id` – Eliminar proyecto

### Permisos
- `POST /projects/:id/permissions` – Agregar/actualizar permiso
- `DELETE /projects/:id/permissions/:userId` – Quitar permiso a usuario

### Versiones
- `GET /projects/:id/versions` – Listar versiones
- `POST /projects/:id/versions` – Crear versión
- `POST /projects/:id/versions/:versionId/restore` – Restaurar versión

### Locking
- `POST /projects/:id/locking/lock` – Bloquear proyecto
- `POST /projects/:id/locking/unlock` – Desbloquear proyecto

## Ejemplos de Uso (cURL)

### Crear Proyecto
```bash
curl -X POST http://localhost:4000/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Mi Proyecto"}'
```

### Listar Proyectos
```bash
curl -X GET http://localhost:4000/projects \
  -H "Authorization: Bearer <token>"
```

### Agregar Permiso
```bash
curl -X POST http://localhost:4000/projects/<projectId>/permissions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "<userId>", "permission": "write"}'
```

## Validación y Errores
- Todos los endpoints validan el payload con Zod.
- Errores devuelven `{ error: string }` y status HTTP adecuado.
- Acceso restringido a endpoints protegidos por JWT.

## Testing
- Tests con Jest y Supertest.
- Teardown seguro y aislado.
- Para ejecutar: `npm test`

---

# Guía para Desarrolladores Frontend

## 1. Autenticación y Headers
- Todos los endpoints protegidos requieren el header:
  ```http
  Authorization: Bearer <token>
  ```
- El token se obtiene al hacer login (`POST /auth/login`).

## 2. Estructura de Respuestas Clave
- **Login:** `{ token }`
- **Crear proyecto:** `{ id, name, ownerId, ... }`
- **Permiso creado/actualizado:** `{ userId, permission }`
- **Lock/Unlock:** `{ isLocked: true|false }`
- **Crear versión:** `{ id, projectId, snapshot }`
- **Restaurar versión:** `{ snapshot }`

## 3. Ejemplo de flujo típico
1. **Registro/Login:**
    - POST `/auth/register` → POST `/auth/login` → guarda el `token` recibido.
2. **Crear proyecto:**
    - POST `/projects` con header `Authorization` y body `{ name }`.
3. **Agregar usuario a proyecto:**
    - POST `/projects/:id/permissions` con `{ userId, permission: 'write' }`.
4. **Crear versión:**
    - POST `/projects/:id/versions` con `{ snapshot }`.
5. **Restaurar versión:**
    - POST `/projects/:id/versions/:versionId/restore`.

## 4. Manejo de errores
- Todos los errores devuelven `{ error: string }` y status HTTP adecuado (401, 403, 404, 409, 400).
- Valida siempre el status antes de consumir la respuesta.

## 5. Recomendaciones para Frontend
- Usa siempre el token JWT en el header para endpoints protegidos.
- Valida los campos requeridos antes de enviar datos.
- Maneja los errores de status 401/403 mostrando mensajes claros al usuario.
- Usa los endpoints `/projects/:id/locking/lock` y `/unlock` para control de edición colaborativa.
- Consulta `/projects/:id/versions` para historial y restauración.

---

# Contacto
Para dudas sobre el backend, flujos o nuevos endpoints, consulta con el equipo backend o revisa los tests en `src/test/` para ejemplos de uso real.

---

# Para dudas o mejoras, consulta la bitácora (`BITACORA.md`).
