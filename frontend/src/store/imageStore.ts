import { create } from 'zustand';
import { apiGet } from '../lib/fetcher';

interface ConfigState {
  s3PublicUrl: string;
  isInitialized: boolean;
  fetchS3PublicUrl: () => Promise<void>;
  getImageUrl: (key: string | null | undefined) => string;
}

export const useImageStore = create<ConfigState>((set, get) => ({
  s3PublicUrl: '',
  isInitialized: false,
  fetchS3PublicUrl: async () => {
    if (get().isInitialized) return;
    try {
      const data = await apiGet<{ s3PublicUrl: string }>('/config');
      set({ s3PublicUrl: data.s3PublicUrl || '', isInitialized: true });
    } catch (error) {
      console.error('Failed to fetch config', error);
      set({ isInitialized: true }); // Prevent infinite retries
    }
  },
  getImageUrl: (key: string | null | undefined) => {
    if (!key) return '';
    if (key.startsWith('http') || key.startsWith('blob:')) return key;
    const base = get().s3PublicUrl;
    return base ? `${base}/${key}` : key;
  },
}));
