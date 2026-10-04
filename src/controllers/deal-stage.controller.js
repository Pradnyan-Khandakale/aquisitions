import {
  createDealStageSchema,
  updateDealStageSchema,
  dealStageIdParamSchema,
} from '#validations/deal-stage.validation.js';
import { formatValidationError } from '#utils/format.js';
import * as dealStageService from '#services/deal-stage.service.js';
import logger from '#config/logger.js';

export const createDealStage = async (req, res, next) => {
  try {
    const validation = createDealStageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(validation.error),
      });
    }

    const stage = await dealStageService.createDealStage(validation.data);
    res.status(201).json({
      success: true,
      message: 'Deal stage created successfully',
      data: stage,
    });
  } catch (err) {
    if (err.code === 'CONFLICT' || err.message?.includes('already exists')) {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message,
      });
    }
    logger.error('createDealStage error:', err);
    next(err);
  }
};

export const getDealStages = async (req, res, next) => {
  try {
    const list = await dealStageService.getAllDealStages();
    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    logger.error('getDealStages error:', err);
    next(err);
  }
};

export const getDealStage = async (req, res, next) => {
  try {
    const paramValidation = dealStageIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const stage = await dealStageService.getDealStageById(paramValidation.data.id);
    if (!stage) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Deal stage with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: stage,
    });
  } catch (err) {
    logger.error('getDealStage error:', err);
    next(err);
  }
};

export const updateDealStage = async (req, res, next) => {
  try {
    const paramValidation = dealStageIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const bodyValidation = updateDealStageSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(bodyValidation.error),
      });
    }

    const updated = await dealStageService.updateDealStage(
      paramValidation.data.id,
      bodyValidation.data
    );

    if (!updated) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Deal stage with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Deal stage updated successfully',
      data: updated,
    });
  } catch (err) {
    if (err.code === 'CONFLICT' || err.message?.includes('already exists')) {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message,
      });
    }
    logger.error('updateDealStage error:', err);
    next(err);
  }
};

export const deleteDealStage = async (req, res, next) => {
  try {
    const paramValidation = dealStageIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const deleted = await dealStageService.deleteDealStage(paramValidation.data.id);
    if (deleted === null) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Deal stage with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Deal stage deleted successfully',
    });
  } catch (err) {
    if (err.code === 'IN_USE') {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message,
      });
    }
    logger.error('deleteDealStage error:', err);
    next(err);
  }
};
