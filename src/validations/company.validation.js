import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255).trim(),
  description: z.string().max(2000).trim().optional().nullable(),
  industry: z.string().max(100).trim().optional().nullable(),
  website: z.string().max(255).trim().optional().nullable(),
});

export const updateCompanySchema = z
  .object({
    name: z.string().min(1, 'Company name cannot be empty').max(255).trim().optional(),
    description: z.string().max(2000).trim().optional().nullable(),
    industry: z.string().max(100).trim().optional().nullable(),
    website: z.string().max(255).trim().optional().nullable(),
  })
  .refine(
    data =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.industry !== undefined ||
      data.website !== undefined,
    {
      message: 'At least one field must be provided for update',
    }
  );

export const companyIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Company ID must be a positive integer'),
});
