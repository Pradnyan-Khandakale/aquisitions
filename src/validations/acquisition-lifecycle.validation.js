import { z } from 'zod';

export const stageTransitionSchema = z
  .object({
    targetStageId: z.coerce.number().int().positive('targetStageId must be a positive integer').optional(),
    target_stage_id: z.coerce.number().int().positive('target_stage_id must be a positive integer').optional(),
    notes: z.string().max(1000).trim().optional().nullable(),
  })
  .transform(data => ({
    target_stage_id: data.target_stage_id ?? data.targetStageId,
    notes: data.notes ?? null,
  }))
  .refine(data => data.target_stage_id !== undefined, {
    message: 'targetStageId (or target_stage_id) is required',
    path: ['targetStageId'],
  });

export const acquisitionIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Acquisition ID must be a positive integer'),
});
