export function Controls({
  size,
  onSize,
  customText,
  onCustomText,
}: {
  size: number
  onSize: (v: number) => void
  customText: string
  onCustomText: (v: string) => void
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/80 p-3 backdrop-blur">
      <label className="flex items-center gap-2 text-sm text-neutral-400">
        Size
        <input
          type="range"
          min={14}
          max={84}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="accent-indigo-500"
        />
        <span className="w-8 tabular-nums text-neutral-300">{size}</span>
      </label>
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <input
          type="text"
          value={customText}
          onChange={(e) => onCustomText(e.target.value)}
          placeholder="Custom sample text (overrides auto-picked words)"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none"
        />
        {customText && (
          <button
            onClick={() => onCustomText('')}
            className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300"
          >
            clear
          </button>
        )}
      </div>
    </div>
  )
}
