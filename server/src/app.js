import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import healthRoutes from './features/health/health.routes.js';
import authRoutes from './features/auth/auth.routes.js';
import cvRoutes from './features/cv/cv.routes.js';
import adminRoutes from './features/admin/admin.routes.js';
import jobsRoutes from './features/jobs/jobs.routes.js';
import internalRoutes from './features/scans/internal.routes.js';
import { requireSameOrigin } from './shared/middleware/sameOrigin.js';
import { notFound, errorHandler } from './shared/middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(requireSameOrigin());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cvs', cvRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
