import type { FeatureInfo } from '../core/types'
import { featureAnchorId } from './FeatureCard'

/**
 * Jump-list of all detected features. Each chip scrolls to its feature card
 * (cards carry the matching anchor id and a "↑" button back here).
 */
export function FeatureNav({ features }: { features: FeatureInfo[] }) {
  if (features.length === 0) return null

  return (
    <div
      id="feature-nav"
      className="scroll-mt-4 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900/30"
    >
      <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">
        Jump to feature · {features.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {features.map((f) => (
          <button
            key={featureAnchorId(f)}
            onClick={() =>
              document.getElementById(featureAnchorId(f))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            title={f.name}
            className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-indigo-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
          >
            {f.tag}
          </button>
        ))}
      </div>
    </div>
  )
}
