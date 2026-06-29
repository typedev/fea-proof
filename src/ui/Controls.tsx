import { useEffect, useRef } from 'react'
import type { FeatureInfo } from '../core/types'
import type { NamedInstance, VariationAxis } from '../core/variations'
import { FeatureNav } from './FeatureNav'
import { AxisControls } from './AxisControls'

export function Controls({
  size,
  onSize,
  theme,
  onToggleTheme,
  features,
  hasCombinations,
  hasOrphans,
  axes,
  instances,
  coords,
  onCoords,
  railMode = false,
}: {
  size: number
  onSize: (v: number) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  features: FeatureInfo[]
  hasCombinations: boolean
  hasOrphans: boolean
  axes: VariationAxis[]
  instances: NamedInstance[]
  coords: Record<string, number>
  onCoords: (c: Record<string, number>) => void
  /** Rendered as a vertical side rail (short viewports) instead of a top bar. */
  railMode?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  // As a sticky TOP bar, publish the panel's height so scroll targets can offset
  // their scroll-margin-top by it — otherwise a jumped-to heading hides under the
  // bar. In rail mode the nav no longer covers the top, so drop the var (consumers
  // fall back to var(--scroll-offset, 1rem)).
  useEffect(() => {
    if (railMode) {
      document.documentElement.style.removeProperty('--scroll-offset')
      return
    }
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
  }, [railMode])

  return (
    <div
      ref={ref}
      className={`flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 ${
        railMode
          ? 'bg-white dark:bg-neutral-900'
          : 'sticky top-0 z-10 bg-white/85 backdrop-blur dark:bg-neutral-900/85'
      }`}
    >
      <div className={railMode ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-4'}>
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
        {!railMode && <div className="flex-1" />}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Scroll to top"
          >
            ↑ Top
          </button>
          <button
            onClick={onToggleTheme}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Toggle light / dark theme"
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </div>
      {axes.length > 0 && (
        <AxisControls axes={axes} instances={instances} coords={coords} onCoords={onCoords} />
      )}
      <FeatureNav
        features={features}
        hasCombinations={hasCombinations}
        hasOrphans={hasOrphans}
        railMode={railMode}
      />
    </div>
  )
}
