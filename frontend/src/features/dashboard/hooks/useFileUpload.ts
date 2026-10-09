import { useState, useRef, useCallback } from 'react'
import { uploadFileToS3 } from '@/api/index'
import type { Media, UseFileUploadOptions, UseFileUploadReturn } from '@/types/upload'

export function useFileUpload({ onUpload, onError }: UseFileUploadOptions = {}): UseFileUploadReturn {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const upload = useCallback(async (file: File): Promise<Media | null> => {
    setUploading(true)
    setProgress(0)
    try {
      const media = await uploadFileToS3(file, (p: number) => setProgress(p))
      onUpload?.(media)
      return media
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
      return null
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [onUpload, onError])

  const uploadFiles = useCallback(async (files: FileList | File[]): Promise<Media[]> => {
    if (!files?.length) return []
    setUploading(true)
    setProgress(0)
    const results: Media[] = []
    for (const file of Array.from(files)) {
      try {
        const media = await uploadFileToS3(file, (p: number) => setProgress(p))
        results.push(media)
        onUpload?.(media)
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    }
    setUploading(false)
    setProgress(0)
    return results
  }, [onUpload, onError])

  const openPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) {
      await uploadFiles(files)
      e.target.value = ''
    }
  }, [uploadFiles])

  return {
    uploading,
    progress,
    inputRef,
    upload,
    uploadFiles,
    openPicker,
    handleInputChange,
  }
}
