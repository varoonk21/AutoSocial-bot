import { z } from 'zod';

export const updateSettingsSchema = z.object({
  name: z.string().trim().max(100, 'Name is too long').optional(),
  notifications: z
    .object({
      postPublished: z.boolean().optional(),
      postFailed: z.boolean().optional(),
      tokenExpiring: z.boolean().optional(),
    })
    .optional(),
});
