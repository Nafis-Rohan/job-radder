import express from 'express';
import healthRoutes from './features/health/health.routes.js';

const app = express();

app.use('/api/health', healthRoutes);

export default app;
