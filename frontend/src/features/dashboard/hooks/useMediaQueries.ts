import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGetPaginated, apiPost, apiDelete } from '@/lib/fetcher'
import { queryKeys } from './queryKeys'

export function useMedia(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: [...queryKeys.media, params],
    queryFn: () => apiGetPaginated(`/media${query ? `?${query}` : ''}`),
  })
}

export function useUploadMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: any) => apiPost('/media', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media })
    },
  })
}

export function useDeleteMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/media/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media })
    },
  })
}
