import { env } from './shared/config/env.js';
import app from './app.js';
import { startScheduler } from './features/scans/scheduler.js';

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});

// In production the host sleeps when idle, so an outside cron calls POST /api/internal/scan instead.
if (env.NODE_ENV !== 'production') startScheduler();
