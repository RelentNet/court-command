import { useState, useRef, useCallback } from 'react'
import { cn } from '../lib/cn'
import { apiPostForm } from '../lib/api'
import { Upload, X, Loader2 } from 'lucide-react'

interface ImageUploadProps {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  accept?: string
  maxSize?: number
  className?: string
}

export function ImageUpload({
  value,
  onChange,
  label = 'Upload Image',
  accept = 'image/jpeg,image/png,image/webp',
  maxSize = 10 * 1024 * 1024,
  className,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(
    async (file: File) => {
      setError(null)
      if (!accept.split(',').some((t) => file.type === t.trim())) {
        setError('Invalid file type')
        return
      }
      if (file.size > maxSize) {
        setError(`File too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`)
        return
      }
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const data = await apiPostForm<{ url: string }>('/api/v1/uploads', formData)
        onChange(data?.url || null)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setUploading(false)
      }
    },
    [accept, maxSize, onChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) upload(file)
    },
    [upload],
  )

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-(--color-text-secondary) mb-1.5">
          {label}
        </label>
      )}
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt=""
            className="h-24 w-24 rounded-lg object-cover border border-(--color-border)"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 rounded-full bg-(--color-bg-primary) border border-(--color-border) p-0.5 text-(--color-text-secondary) hover:text-red-400"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={label || 'Upload image'}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
            dragOver
              ? 'border-cyan-500 bg-cyan-500/5'
              : 'border-(--color-border) hover:border-(--color-text-secondary)',
            uploading && 'pointer-events-none opacity-50',
          )}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 text-(--color-text-secondary) animate-spin" />
          ) : (
            <>
              <Upload className="h-8 w-8 text-(--color-text-secondary) mb-2" />
              <span className="text-sm text-(--color-text-secondary)">
                Drop file here or click to upload
              </span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload(file)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-1 text-xs text-red-400" role="alert">{error}</p>}
    </div>
  )
}
