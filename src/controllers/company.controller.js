import {
  createCompanySchema,
  updateCompanySchema,
  companyIdParamSchema,
} from '#validations/company.validation.js';
import { formatValidationError } from '#utils/format.js';
import * as companyService from '#services/company.service.js';
import logger from '#config/logger.js';

export const createCompany = async (req, res, next) => {
  try {
    const validation = createCompanySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(validation.error),
      });
    }

    const company = await companyService.createCompany(validation.data);
    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: company,
    });
  } catch (err) {
    if (err.code === 'CONFLICT' || err.message?.includes('already exists')) {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message,
      });
    }
    logger.error('createCompany error:', err);
    next(err);
  }
};

export const getCompanies = async (req, res, next) => {
  try {
    const list = await companyService.getAllCompanies();
    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (err) {
    logger.error('getCompanies error:', err);
    next(err);
  }
};

export const getCompany = async (req, res, next) => {
  try {
    const paramValidation = companyIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const company = await companyService.getCompanyById(paramValidation.data.id);
    if (!company) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Company with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (err) {
    logger.error('getCompany error:', err);
    next(err);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    const paramValidation = companyIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const bodyValidation = updateCompanySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(bodyValidation.error),
      });
    }

    const updated = await companyService.updateCompany(
      paramValidation.data.id,
      bodyValidation.data
    );

    if (!updated) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Company with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      data: updated,
    });
  } catch (err) {
    if (err.code === 'CONFLICT' || err.message?.includes('already exists')) {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message,
      });
    }
    logger.error('updateCompany error:', err);
    next(err);
  }
};

export const deleteCompany = async (req, res, next) => {
  try {
    const paramValidation = companyIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramValidation.error),
      });
    }

    const deleted = await companyService.deleteCompany(paramValidation.data.id);
    if (!deleted) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Company with ID ${paramValidation.data.id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company deleted successfully',
    });
  } catch (err) {
    logger.error('deleteCompany error:', err);
    next(err);
  }
};
