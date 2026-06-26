import { useCallback, useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  busy?: boolean
  compact?: boolean
}

const ACCEPT = '.otf,.ttf,.woff,.woff2'

export function DropZone({ onFile, busy, compact }: Props) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0]
      if (f) onFile(f)
    },
    [onFile],
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handleFiles(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
      className={[
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors',
        compact ? 'gap-1 p-6' : 'gap-3 p-16',
        drag
          ? 'border-indigo-400 bg-indigo-500/10'
          : 'border-neutral-300 bg-neutral-100/60 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/40 dark:hover:border-neutral-500',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className={compact ? 'text-sm font-medium' : 'text-lg font-semibold'}>
        {busy ? 'Reading font…' : 'Drop a font here'}
      </div>
      {!compact && (
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          or click to choose · .otf .ttf .woff .woff2 · processed locally, never uploaded
        </div>
      )}
    </div>
  )
}
