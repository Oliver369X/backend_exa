# Bitácora de Desarrollo Backend

## [2025-04-18] Mejoras de Testeo, Permisos y Documentación

- **Tema:** Refactorización de tests, robustecimiento de permisos y teardown seguro.
- **Cambios realizados:**
  - Se corrigieron errores de constraints en la base de datos durante el teardown de tests.
  - Se ajustó el helper de autenticación y limpieza de datos.
  - Se modificó `app.ts` para evitar el conflicto de puertos en entorno de test.
  - Se planificó la ampliación de cobertura de tests y la documentación técnica.
- **Justificación:**
  - Garantizar que los tests sean reproducibles, limpios y no dejen residuos en la base de datos.
  - Mejorar la robustez de la validación de permisos y el manejo de errores.
- **Próximos pasos:**
  - Ampliar test suite con casos de permisos, errores y validaciones.
  - Documentar endpoints y ejemplos de uso.

---

## [2025-04-18] Estado Inicial y Objetivo
- **Tema:** Estado del backend de proyectos, autenticación y permisos.
- **Cambios realizados:**
  - Se implementó protección de rutas, validación de usuario y manejo de errores con TypeScript y Zod.
  - Se crearon modelos en Prisma para usuarios, proyectos, permisos y versiones.
- **Justificación:**
  - Seguridad y robustez en la gestión de proyectos multiusuario.
- **Próximos pasos:**
  - Mejorar documentación y cobertura de tests.

---

# Notas
- Todas las decisiones técnicas y cambios relevantes quedarán registrados aquí para trazabilidad y auditoría.
