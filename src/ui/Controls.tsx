export function Controls({
  size,
  onSize,
  theme,
  onToggleTheme,
}: {
  size: number
  onSize: (v: number) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 bg-white/80 p-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
      <label className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        Size
        <input
          type="range"
          min={14}
          max={84}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="accent-indigo-500"
        />
        <span className="w-8 tabular-nums text-neutral-700 dark:text-neutral-300">{size}</span>
      </label>
      <div className="flex-1" />
      <button
        onClick={onToggleTheme}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
        title="Toggle light / dark theme"
      >
        {theme === 'dark' ? '☀ Light' : '☾ Dark'}
      </button>
    </div>
  )
}
