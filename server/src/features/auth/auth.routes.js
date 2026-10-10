import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { loginSchema } from './auth.schemas.js';
import * as authController from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), authController.login);

export default router;
