# Plataforma Colaborativa Backend

## Arquitectura de Base de Datos Multi-Entorno

Este backend soporta dos modos de conexión a base de datos:
- **Desarrollo:** PostgreSQL local (por defecto)
- **Producción:** Supabase PostgreSQL (cloud)

### Variables de entorno

**Desarrollo (`.env`):**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/platform_db?schema=public
```

**Producción (`.env.production`):**
```
DATABASE_URL=postgresql://postgres:[SUPABASE_PASSWORD]@rlisbwawrcykbchxcnrh.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=sbp_189c750b8d57d714592968eb4084af29aebf753a
SUPABASE_URL=https://rlisbwawrcykbchxcnrh.supabase.co
```

> **Nota:** Nunca subas `.env.production` con credenciales reales a git. Usa variables de entorno en tu plataforma de despliegue.

### Alternar entre entornos
- Prisma y el backend usan la variable `DATABASE_URL` para decidir a qué base conectarse.
- Usa `.env` para desarrollo local y `.env.production` (o variables de entorno) en producción.

### Migraciones
- Ejecuta `npx prisma migrate dev --name init` en local.
- Para Supabase, usa `npx prisma db push` si no tienes acceso a migraciones, o configura migraciones en tu CI/CD.

---

## Seguridad
- El `SUPABASE_SERVICE_ROLE_KEY` solo debe usarse en el backend (nunca en el frontend).
- El endpoint público de Supabase es: `https://rlisbwawrcykbchxcnrh.supabase.co`

---

## Preguntas frecuentes
- ¿Puedo usar la misma base de datos para desarrollo y producción? **No recomendado**. Usa local para dev y Supabase para prod.
- ¿Puedo usar otros servicios de Supabase (Auth, Storage)? **Sí**. Agrega las variables y SDK según lo requieras.
