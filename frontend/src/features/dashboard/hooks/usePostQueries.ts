import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiDelete } from '@/lib/fetcher'
import { queryKeys } from './queryKeys'

export function usePosts(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString()

  return useQuery({
    queryKey: [...queryKeys.posts, params],
    queryFn: () => apiGet(`/posts${query ? `?${query}` : ''}`),
  })
}

export function useDeletePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts })
    },
  })
}
