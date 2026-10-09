export interface Media {
  _id: string
  userId: string
  name: string
  originalName?: string
  type: 'image' | 'video'
  fileSize: number
  key: string
  thumbnail?: string
  alt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export interface UseFileUploadOptions {
  onUpload?: (media: Media) => void
  onError?: (error: Error) => void
}

export interface UseFileUploadReturn {
  uploading: boolean
  progress: number
  inputRef: React.RefObject<HTMLInputElement | null>
  upload: (file: File) => Promise<Media | null>
  uploadFiles: (files: FileList | File[]) => Promise<Media[]>
  openPicker: () => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

export interface FileUploadProps {
  accept?: string
  multiple?: boolean
  onUpload?: (media: Media) => void
  onError?: (error: Error) => void
  children: React.ReactNode
  className?: string
  dropzoneClassName?: string
}
