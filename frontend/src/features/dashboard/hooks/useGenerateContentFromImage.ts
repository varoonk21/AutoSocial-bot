import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/fetcher";

interface GenerateContentFromImageParams {
  imageUrl: string;
}

interface ImageContent {
  description: string;
  hashtags: string;
}

export function useGenerateContentFromImage() {
  return useMutation({
    mutationFn: async ({ imageUrl }: GenerateContentFromImageParams) => {
      const data = await apiPost<ImageContent>("/ai/generate-content-from-image", {
        imageUrl,
      });
      return data;
    },
  });
}
