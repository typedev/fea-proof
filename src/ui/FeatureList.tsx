import type { FeatureInfo } from '../core/types'
import type { FeatureSample } from '../samples'
import type { Shaper } from '../core/shape'
import { FeatureCard } from './FeatureCard'

export function FeatureList({
  features,
  samples = new Map(),
  cssFamily,
  size,
  shaper,
  onOpenMarkExplorer,
}: {
  features: FeatureInfo[]
  samples?: Map<string, FeatureSample>
  cssFamily: string
  size?: number
  shaper?: Shaper
  onOpenMarkExplorer?: (feature: FeatureInfo) => void
}) {
  if (features.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
        No GSUB/GPOS features found in this font.
      </div>
    )
  }

  const substitutionCount = features.filter((f) => f.tables.includes('GSUB')).length
  const positioningCount = features.length - substitutionCount

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-lg font-semibold">Features</h2>
        <span className="text-sm text-neutral-500">
          {substitutionCount} substitution · {positioningCount} positioning
        </span>
      </div>
      {features.map((f) => (
        <FeatureCard
          key={`${f.tag}-${f.tables.join('')}`}
          feature={f}
          sample={samples.get(f.tag)}
          cssFamily={cssFamily}
          size={size}
          shaper={shaper}
          onOpenMarkExplorer={onOpenMarkExplorer}
        />
      ))}
    </div>
  )
}
