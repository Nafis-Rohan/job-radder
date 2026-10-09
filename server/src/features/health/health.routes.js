import { Router } from 'express';
import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    logger.error({ message: err.message }, 'Health check: database down');
    res.status(503).json({ ok: false, db: 'down' });
  }
});

export default router;
