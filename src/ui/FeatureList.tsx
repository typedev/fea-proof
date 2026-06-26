import type { FeatureInfo } from '../core/types'
import type { FeatureSample } from '../samples'
import { FeatureCard } from './FeatureCard'

export function FeatureList({
  features,
  samples = new Map(),
  cssFamily,
}: {
  features: FeatureInfo[]
  samples?: Map<string, FeatureSample>
  cssFamily: string
}) {
  if (features.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
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
        />
      ))}
    </div>
  )
}
