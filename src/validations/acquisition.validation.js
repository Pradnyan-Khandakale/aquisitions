import { z } from 'zod';

export const createAcquisitionSchema = z
  .object({
    title: z.string().min(1, 'Acquisition title is required').max(255).trim(),
    description: z.string().max(5000).trim().optional().nullable(),
    company_id: z.coerce.number().int().positive('Company ID must be a positive integer').optional(),
    companyId: z.coerce.number().int().positive('Company ID must be a positive integer').optional(),
    deal_stage_id: z.coerce.number().int().positive('Deal stage ID must be a positive integer').optional(),
    dealStageId: z.coerce.number().int().positive('Deal stage ID must be a positive integer').optional(),
    status: z.enum(['active', 'won', 'lost', 'abandoned', 'on-hold']).default('active'),
    estimated_value: z.coerce.number().positive('Estimated value must be a positive number').optional().nullable(),
    estimatedValue: z.coerce.number().positive('Estimated value must be a positive number').optional().nullable(),
    target_close_date: z.coerce.date().optional().nullable(),
    targetCloseDate: z.coerce.date().optional().nullable(),
  })
  .transform(data => ({
    title: data.title,
    description: data.description ?? null,
    company_id: data.company_id ?? data.companyId,
    deal_stage_id: data.deal_stage_id ?? data.dealStageId,
    status: data.status,
    estimated_value: data.estimated_value ?? data.estimatedValue ?? null,
    target_close_date: data.target_close_date ?? data.targetCloseDate ?? null,
  }))
  .refine(data => data.company_id !== undefined, {
    message: 'company_id (or companyId) is required',
    path: ['company_id'],
  })
  .refine(data => data.deal_stage_id !== undefined, {
    message: 'deal_stage_id (or dealStageId) is required',
    path: ['deal_stage_id'],
  });

export const updateAcquisitionSchema = z
  .object({
    title: z.string().min(1, 'Title cannot be empty').max(255).trim().optional(),
    description: z.string().max(5000).trim().optional().nullable(),
    company_id: z.coerce.number().int().positive('Company ID must be a positive integer').optional(),
    companyId: z.coerce.number().int().positive('Company ID must be a positive integer').optional(),
    status: z.enum(['active', 'won', 'lost', 'abandoned', 'on-hold']).optional(),
    estimated_value: z.coerce.number().positive('Estimated value must be a positive number').optional().nullable(),
    estimatedValue: z.coerce.number().positive('Estimated value must be a positive number').optional().nullable(),
    target_close_date: z.coerce.date().optional().nullable(),
    targetCloseDate: z.coerce.date().optional().nullable(),
  })
  .transform(data => {
    const transformed = {};
    if (data.title !== undefined) transformed.title = data.title;
    if (data.description !== undefined) transformed.description = data.description;
    const cid = data.company_id ?? data.companyId;
    if (cid !== undefined) transformed.company_id = cid;
    if (data.status !== undefined) transformed.status = data.status;
    const val = data.estimated_value ?? data.estimatedValue;
    if (val !== undefined) transformed.estimated_value = val;
    const dt = data.target_close_date ?? data.targetCloseDate;
    if (dt !== undefined) transformed.target_close_date = dt;
    return transformed;
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const acquisitionIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Acquisition ID must be a positive integer'),
});
