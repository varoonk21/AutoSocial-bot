import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/fetcher";

type EnhanceType = "caption" | "hashtags" | "general";

interface EnhanceWithAIResult {
  post: string;
}

/**
 * useEnhanceField — a self-contained AI improve hook for a single text field.
 *
 * @param enhanceType  — the type of content to enhance ("caption" | "hashtags" | "general")
 * @param getValue     — getter for the current field value
 * @param setValue     — setter to update the field with the AI response
 * @param transform    — optional transform function applied to the raw AI response before calling setValue
 */
export function useEnhanceField({
  enhanceType,
  getValue,
  setValue,
  transform,
}: {
  enhanceType: EnhanceType;
  getValue: () => string;
  setValue: (value: string) => void;
  transform?: (raw: string) => string;
}) {
  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const data = await apiPost<EnhanceWithAIResult>("/ai/enhance", {
        content,
        enhanceType,
      });
      return data;
    },
    onSuccess: (data) => {
      if (data?.post) {
        const improved = transform ? transform(data.post) : data.post;
        setValue(improved);
      }
    },
  });

  const improve = () => {
    const content = getValue().trim();
    if (!content) return;
    mutation.mutate(content);
  };

  return {
    improve,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
