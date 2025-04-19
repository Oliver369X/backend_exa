import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { json } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { userRouter } from './modules/users/user.router';
import { passwordRecoveryRouter } from './modules/auth/password-recovery.router';
import { projectRouter } from './modules/projects/project.router';
import { setupSwagger } from './swagger';

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

app.use('/auth', authRouter);
app.use('/auth', passwordRecoveryRouter);
app.use('/users', userRouter);
app.use('/projects', projectRouter);

app.get('/', (_, res) => {
  res.json({ status: 'API OK' });
});

setupSwagger(app);

const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export { app };
