import { useRef, useState } from 'react'
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import config from '../../../config'
import { resolveImageUrl } from '../../../utils/theme'

interface ImageUploadProps {
  label: string
  description?: string
  value: string | null
  onChange: (url: string | null) => void
}

const MAX_BYTES = 5 * 1024 * 1024

export function ImageUpload({
  label,
  description,
  value,
  onChange,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolved = resolveImageUrl(value, config.API_URL)

  const handleFile = async (file: File) => {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError('Image exceeds 5 MB limit.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${config.API_URL}/uploads`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          detail?: string
        } | null
        throw new Error(data?.detail || `Upload failed (${res.status})`)
      }
      const data = (await res.json()) as { url: string }
      onChange(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-xs font-bold uppercase text-slate-300">
          {label}
        </div>
        {description && (
          <div className="text-xs text-slate-500 mt-0.5">{description}</div>
        )}
      </div>
      <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-lg p-2">
        <div className="w-16 h-16 flex-shrink-0 bg-slate-800 rounded-md flex items-center justify-center overflow-hidden">
          {resolved ? (
            <img
              src={resolved}
              alt=""
              className="w-full h-full object-contain"
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-slate-600" />
          )}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 justify-center bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 rounded-md text-sm text-white transition-colors"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : resolved ? 'Replace' : 'Upload'}
          </button>
          {resolved && (
            <button
              type="button"
              onClick={() => {
                setError(null)
                onChange(null)
              }}
              className="flex items-center gap-2 justify-center bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md text-xs text-red-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      {error && (
        <div className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-slate-500">
        PNG, JPG, WebP, GIF, or SVG. Max 5 MB.
      </div>
    </div>
  )
}
