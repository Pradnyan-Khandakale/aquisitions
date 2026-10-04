import express from 'express';
import {
  createAcquisition,
  getAcquisitions,
  getAcquisition,
  updateAcquisition,
  transitionStage,
  deleteAcquisition,
} from '#controllers/acquisition.controller.js';
import {
  authenticate,
  optionalAuthenticate,
} from '#middleware/auth.middleware.js';

const router = express.Router();

router.post('/', optionalAuthenticate, createAcquisition);
router.get('/', getAcquisitions);
router.get('/:id', getAcquisition);
router.patch('/:id', optionalAuthenticate, updateAcquisition);
router.patch('/:id/stage', authenticate, transitionStage);
router.delete('/:id', optionalAuthenticate, deleteAcquisition);

export default router;
