import type { FeatureInfo } from '../core/types'
import { featureAnchorId } from './FeatureCard'

const jump = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * Jump-list of all detected features, plus the page's special sections. Lives in
 * the sticky controls bar so it's always in reach; each target carries a matching
 * anchor id and a scroll-margin-top (via --scroll-offset) so it lands below the bar.
 */
export function FeatureNav({
  features,
  hasCombinations,
  hasOrphans,
  railMode = false,
}: {
  features: FeatureInfo[]
  hasCombinations: boolean
  hasOrphans: boolean
  /** In the side rail the list may grow tall; otherwise it's capped + scrolls. */
  railMode?: boolean
}) {
  if (features.length === 0) return null

  return (
    <div className="flex items-start gap-2 border-t border-neutral-200 pt-2.5 dark:border-neutral-800">
      <span className="mt-1 shrink-0 text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-600">
        Jump to
      </span>
      <div
        className={`flex flex-wrap gap-1.5 overflow-y-auto ${railMode ? 'max-h-[60vh]' : 'max-h-28'}`}
      >
        {features.map((f) => (
          <button
            key={featureAnchorId(f)}
            onClick={() => jump(featureAnchorId(f))}
            title={f.name}
            className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-indigo-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
          >
            {f.tag}
          </button>
        ))}
        {hasCombinations && (
          <button
            onClick={() => jump('feature-combinations')}
            title="Feature combinations"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            combinations
          </button>
        )}
        {hasOrphans && (
          <button
            onClick={() => jump('unreachable-glyphs')}
            title="Unreachable glyphs"
            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            unreachable
          </button>
        )}
      </div>
    </div>
  )
}
