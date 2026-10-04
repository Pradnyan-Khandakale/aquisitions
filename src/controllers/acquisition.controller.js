import {
  createAcquisitionSchema,
  updateAcquisitionSchema,
  acquisitionIdParamSchema,
} from '#validations/acquisition.validation.js';
import { formatValidationError } from '#utils/format.js';
import * as acquisitionService from '#services/acquisition.service.js';
import logger from '#config/logger.js';

export const createAcquisition = async (req, res, next) => {
  try {
    const validation = createAcquisitionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(validation.error),
      });
    }

    // Determine created_by strictly from authenticated user context (never from arbitrary client input)
    const createdBy = req.user?.id || null;

    const acquisition = await acquisitionService.createAcquisition({
      ...validation.data,
      created_by: createdBy,
    });

    res.status(201).json({
      success: true,
      message: 'Acquisition created successfully',
      data: acquisition,
    });
  } catch (err) {
    if (err.code === 'RELATION_NOT_FOUND') {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: err.message,
      });
    }
    logger.error('createAcquisition error:', err);
    next(err);
  }
};

export const getAcquisitions = async (req, res, next) => {
  try {
    const list = await acquisitionService.getAllAcquisitions();
    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    logger.error('getAcquisitions error:', err);
    next(err);
  }
};

export const getAcquisition = async (req, res, next) => {
  try {
    const paramValidation = acquisitionIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const item = await acquisitionService.getAcquisitionById(paramValidation.data.id);
    if (!item) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Acquisition with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (err) {
    logger.error('getAcquisition error:', err);
    next(err);
  }
};

export const updateAcquisition = async (req, res, next) => {
  try {
    const paramValidation = acquisitionIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const bodyValidation = updateAcquisitionSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(bodyValidation.error),
      });
    }

    const updated = await acquisitionService.updateAcquisition(
      paramValidation.data.id,
      bodyValidation.data
    );

    if (!updated) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Acquisition with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Acquisition updated successfully',
      data: updated,
    });
  } catch (err) {
    if (err.code === 'RELATION_NOT_FOUND') {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: err.message,
      });
    }
    logger.error('updateAcquisition error:', err);
    next(err);
  }
};

export const deleteAcquisition = async (req, res, next) => {
  try {
    const paramValidation = acquisitionIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const deleted = await acquisitionService.deleteAcquisition(paramValidation.data.id);
    if (!deleted) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Acquisition with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Acquisition deleted successfully',
    });
  } catch (err) {
    logger.error('deleteAcquisition error:', err);
    next(err);
  }
};
