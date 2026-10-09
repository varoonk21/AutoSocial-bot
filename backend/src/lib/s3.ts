import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import awsEnv from "../config/aws.config.js";

const s3Client = new S3Client({
  region: awsEnv.AWS_REGION,
  endpoint: awsEnv.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: awsEnv.AWS_ACCESS_KEY_ID,
    secretAccessKey: awsEnv.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = awsEnv.AWS_S3_BUCKET;
const PRESIGNED_URL_EXPIRY = awsEnv.S3_PRESIGNED_URL_EXPIRY;

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });
}

export async function getS3Url(key: string): Promise<string> {
  if (awsEnv.S3_PUBLIC_URL) {
    return `${awsEnv.S3_PUBLIC_URL}/${key}`;
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });
}

export async function deleteS3Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3Client.send(command);
}

export async function uploadToS3(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    Body: body,
  });
  await s3Client.send(command);
  return key;
}
