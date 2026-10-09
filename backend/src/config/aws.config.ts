import { z } from "zod";

const awsEnvSchema = z.object({
  AWS_REGION: z.string().optional().default("auto"),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  S3_PRESIGNED_URL_EXPIRY: z.coerce.number().int().min(60).max(3600).optional().default(300),
});

const parsed = awsEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid AWS environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const awsEnv = parsed.data;

export type AwsEnv = z.infer<typeof awsEnvSchema>;

export default awsEnv;
