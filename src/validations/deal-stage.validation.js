import { z } from 'zod';

export const createDealStageSchema = z.object({
  name: z.string().min(1, 'Deal stage name is required').max(100).trim(),
  description: z.string().max(1000).trim().optional().nullable(),
  sequence: z.coerce.number().int().min(0, 'Sequence must be a non-negative integer').default(0),
});

export const updateDealStageSchema = z
  .object({
    name: z.string().min(1, 'Deal stage name cannot be empty').max(100).trim().optional(),
    description: z.string().max(1000).trim().optional().nullable(),
    sequence: z.coerce.number().int().min(0, 'Sequence must be a non-negative integer').optional(),
  })
  .refine(
    data =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.sequence !== undefined,
    {
      message: 'At least one field must be provided for update',
    }
  );

export const dealStageIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Deal stage ID must be a positive integer'),
});
