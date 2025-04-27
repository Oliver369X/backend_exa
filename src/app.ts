import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { json } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { userRouter } from './modules/users/user.router';
import { passwordRecoveryRouter } from './modules/auth/password-recovery.router';
import { projectRouter } from './modules/projects/project.router';
import { pagesController } from './modules/pages';
import { setupSwagger } from './swagger';
import { setupCollabSocket } from "./socket/collab-socket";
import http from "http";

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(json());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/auth', authRouter);
app.use('/auth', passwordRecoveryRouter);
app.use('/users', userRouter);
app.use('/projects', projectRouter);
app.use('/pages', pagesController);

app.get('/', (_, res) => {
  res.json({ status: 'API OK' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', version: process.env.npm_package_version || 'dev' });
});

setupSwagger(app);

const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  // --- Levanta API + Socket.io en el mismo proceso ---
  setupCollabSocket(server, app);
  server.listen(port, () => {
    console.log(`API + Collab WebSocket server running on port ${port}`);
  });
}

export { app };
