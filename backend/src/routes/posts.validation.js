import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

export const postIdParamSchema = z.object({
  id: objectId,
});

const postItemSchema = z.object({
  content: z.string().max(10000, 'Content is too long').default(''),
  integrationId: objectId.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  media: z.array(z.unknown()).max(10, 'Too many media items').optional(),
});

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const createPostSchema = z.object({
  type: z.enum(['schedule', 'now', 'draft']).default('schedule'),
  date: isoDate.optional(),
  posts: z.array(postItemSchema).min(1, 'At least one post is required').max(20, 'Too many posts'),
});

export const updatePostSchema = z.object({
  content: z.string().max(10000, 'Content is too long').optional(),
  date: isoDate.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  media: z.array(z.unknown()).max(10, 'Too many media items').optional(),
  state: z.enum(['DRAFT', 'QUEUE']).optional(),
});
