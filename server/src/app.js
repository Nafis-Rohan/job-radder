import express from 'express';
import helmet from 'helmet';
import healthRoutes from './features/health/health.routes.js';
import { notFound, errorHandler } from './shared/middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
