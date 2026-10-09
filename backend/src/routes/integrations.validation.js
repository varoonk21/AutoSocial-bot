import { z } from 'zod';

export const PROVIDERS = ['facebook', 'instagram', 'x', 'linkedin'];

export const providerParamSchema = z.object({
  provider: z.enum(PROVIDERS, 'Unknown provider'),
});

export const integrationIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid integration ID'),
});

export const savePageSchema = z.object({
  tempState: z.string().min(1, 'tempState is required'),
  pageData: z.object({
    id: z.string().min(1, 'pageData.id is required'),
    name: z.string().min(1, 'pageData.name is required'),
    // Facebook's pages() entries include access_token; Instagram's do not —
    // the page token is resolved server-side via fetchPageInformation.
    access_token: z.string().min(1).optional(),
    // Instagram's pages() entries carry the parent Facebook Page id here.
    pageId: z.string().min(1).optional(),
    picture: z
      .object({ data: z.object({ url: z.string() }).optional() })
      .optional(),
    username: z.string().optional(),
  }),
});

export const tempStateQuerySchema = z.object({
  tempState: z.string().min(1, 'tempState is required'),
});

export const toggleDisableSchema = z.object({
  disabled: z.boolean('disabled must be a boolean'),
});
