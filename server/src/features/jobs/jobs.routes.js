import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { listJobsQuerySchema, jobIdParamSchema } from './jobs.schemas.js';
import { buildJobsController } from './jobs.controller.js';

// Any logged-in user. `guard` and `controller` can be replaced in tests.
export function buildJobsRouter({ guard = [requireAuth], controller = buildJobsController() } = {}) {
  const router = Router();
  router.use(...guard);

  router.get('/', validate(listJobsQuerySchema, 'query'), controller.list);
  router.get('/:id', validate(jobIdParamSchema, 'params'), controller.get);

  return router;
}

export default buildJobsRouter();
