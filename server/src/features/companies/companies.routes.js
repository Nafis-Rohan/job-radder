import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCompanySchema, updateCompanySchema, companyIdParamSchema } from './companies.schemas.js';
import { buildCompaniesController } from './companies.controller.js';

// Any logged-in user, and only ever their own favorites. `guard` and `controller` can be replaced in tests.
export function buildCompaniesRouter({ guard = [requireAuth], controller = buildCompaniesController() } = {}) {
  const router = Router();
  router.use(...guard);

  router.get('/', controller.list);
  router.post('/', validate(createCompanySchema), controller.create);
  router.patch('/:id', validate(companyIdParamSchema, 'params'), validate(updateCompanySchema), controller.update);
  router.delete('/:id', validate(companyIdParamSchema, 'params'), controller.remove);

  return router;
}

export default buildCompaniesRouter();
