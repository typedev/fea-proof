import { useMemo, useState, type CSSProperties } from 'react'
import type { CombinationGroup, FeatureToggle } from '../core/combinations'
import type { Shaper } from '../core/shape'
import { effectiveFeatures } from '../core/interactions'

function buildSettings(features: FeatureToggle[], active: Set<string>): string {
  const parts: string[] = []
  for (const f of features) {
    if (active.has(f.tag)) parts.push(`"${f.tag}" 1`)
    else if (f.defaultOn) parts.push(`"${f.tag}" 0`)
  }
  return parts.length ? parts.join(', ') : 'normal'
}

function CombinationCard({
  group,
  cssFamily,
  size,
  shaper,
}: {
  group: CombinationGroup
  cssFamily: string
  size: number
  shaper?: Shaper
}) {
  const [active, setActive] = useState<Set<string>>(new Set())
  const text = group.chars.join(' ')

  const toggle = (tag: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  // Which features actually change the rendering in the current state (live).
  const effective = useMemo(() => {
    if (!shaper) return null
    try {
      return effectiveFeatures(shaper, text, group.features, active)
    } catch {
      return null
    }
  }, [shaper, text, group.features, active])

  const style: CSSProperties = {
    fontFamily: `"${cssFamily}", system-ui`,
    fontSize: size,
    lineHeight: 1.3,
    fontFeatureSettings: buildSettings(group.features, active),
  }

  const chipClass = (tag: string): string => {
    const isActive = active.has(tag)
    const noEffect = effective ? !effective.has(tag) : false
    const base = isActive
      ? 'bg-indigo-600 text-white'
      : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
    return `rounded px-2 py-1 font-mono text-xs font-medium ${base} ${noEffect ? 'opacity-40' : ''}`
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/30">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setActive(new Set())}
          className={`rounded px-2 py-1 text-xs font-medium ${
            active.size === 0
              ? 'bg-indigo-600 text-white'
              : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
          }`}
        >
          plain
        </button>
        {group.features.map((f) => (
          <button
            key={f.tag}
            onClick={() => toggle(f.tag)}
            title={effective && !effective.has(f.tag) ? `${f.name} — no effect in this combination` : f.name}
            className={chipClass(f.tag)}
          >
            {f.tag}
          </button>
        ))}
      </div>
      <div style={style} className="break-words text-neutral-900 dark:text-neutral-100">
        {text}
      </div>
    </div>
  )
}

export function CombinationExplorer({
  groups,
  cssFamily,
  size = 40,
  shaper,
}: {
  groups: CombinationGroup[]
  cssFamily: string
  size?: number
  shaper?: Shaper
}) {
  if (groups.length === 0) return null

  return (
    <div id="feature-combinations" style={{ scrollMarginTop: 'var(--scroll-offset, 1rem)' }} className="space-y-3">
      <div className="px-1">
        <h2 className="text-lg font-semibold">Feature combinations</h2>
        <p className="text-sm text-neutral-500">
          Glyphs touched by several features — toggle features (applied in the font's
          LookupList order) to see how they stack. Dimmed chips have no effect in the
          current combination (overridden or unmet dependency).
        </p>
      </div>
      {groups.map((g, i) => (
        <CombinationCard key={i} group={g} cssFamily={cssFamily} size={size} shaper={shaper} />
      ))}
    </div>
  )
}
