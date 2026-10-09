import { apiPost } from "../lib/fetcher";
import type { Media } from "../types/upload";

/**
 * Uploads a file to S3 via presigned URL.
 * Returns metadata for saving to backend.
 */
export async function uploadFileToS3(file: File, onProgress?: (progress: number) => void, source = "user"): Promise<Media> {
  const { presignedUrl, key } = await apiPost<{ presignedUrl: string; key: string }>("/media/upload-url", {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200 || xhr.status === 204) {
        try {
          const media = await apiPost<{ media: Media }>("/media", {
            key,
            originalName: file.name,
            contentType: file.type,
            fileSize: file.size,
            source,
          });
          resolve(media.media);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error("S3 upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("S3 upload failed"));
    xhr.send(file);
  });
}
