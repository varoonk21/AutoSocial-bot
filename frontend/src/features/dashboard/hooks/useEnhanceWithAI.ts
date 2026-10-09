import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/fetcher";

type EnhanceType = "caption" | "hashtags" | "general";

interface EnhanceWithAIParams {
  content: string;
  enhanceType: EnhanceType;
}

interface EnhanceWithAIResult {
  post: string;
}

export function useEnhanceWithAI() {
  return useMutation({
    mutationFn: async ({ content, enhanceType }: EnhanceWithAIParams) => {
      const data = await apiPost<EnhanceWithAIResult>("/ai/enhance", {
        content,
        enhanceType,
      });
      return data;
    },
  });
}
