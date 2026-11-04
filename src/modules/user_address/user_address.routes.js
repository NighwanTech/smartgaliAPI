import express from 'express';
import * as controller from './user_address.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate, createAddressSchema, updateAddressSchema } from './user_address.validation.js';

const router = express.Router();

// Require authentication for all user address endpoints
router.use(authenticate);

router.get('/', controller.listAddresses);
router.post('/', validate(createAddressSchema), controller.addAddress);
router.get('/:id', controller.getAddress);
router.put('/:id', validate(updateAddressSchema), controller.editAddress);
router.patch('/:id/default', controller.setDefault);
router.delete('/:id', controller.removeAddress);

export default router;

