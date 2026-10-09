import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut, apiDelete } from '@/lib/fetcher'
import { queryKeys } from './queryKeys'

export function useBrandKit() {
  return useQuery({
    queryKey: queryKeys.brandKit,
    queryFn: () => apiGet('/brand-kit'),
  })
}

export function useSaveBrandKit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: any) => apiPut('/brand-kit', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brandKit })
    },
  })
}

export function useDeleteBrandKit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiDelete('/brand-kit'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brandKit })
    },
  })
}
