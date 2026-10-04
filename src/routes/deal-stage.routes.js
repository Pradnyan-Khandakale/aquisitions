import express from 'express';
import {
  createDealStage,
  getDealStages,
  getDealStage,
  updateDealStage,
  deleteDealStage,
} from '#controllers/deal-stage.controller.js';

const router = express.Router();

router.post('/', createDealStage);
router.get('/', getDealStages);
router.get('/:id', getDealStage);
router.patch('/:id', updateDealStage);
router.delete('/:id', deleteDealStage);

export default router;
