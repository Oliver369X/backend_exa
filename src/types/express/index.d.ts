import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      name: string;
      // Agrega aquí otros campos de usuario si los necesitas
    };
  }
}
