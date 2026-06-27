import { useEffect, useRef } from 'react'
import type { FeatureInfo } from '../core/types'
import { FeatureNav } from './FeatureNav'

export function Controls({
  size,
  onSize,
  theme,
  onToggleTheme,
  features,
  hasCombinations,
  hasOrphans,
}: {
  size: number
  onSize: (v: number) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  features: FeatureInfo[]
  hasCombinations: boolean
  hasOrphans: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Publish the sticky panel's height so scroll targets can offset their
  // scroll-margin-top by it — otherwise a jumped-to heading hides under the bar.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      document.documentElement.style.setProperty('--scroll-offset', `${el.offsetHeight + 12}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--scroll-offset')
    }
  }, [])

  return (
    <div
      ref={ref}
      className="sticky top-0 z-10 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white/85 p-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/85"
    >
      <div className="flex flex-wrap items-center gap-4">
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
      <FeatureNav features={features} hasCombinations={hasCombinations} hasOrphans={hasOrphans} />
    </div>
  )
}
