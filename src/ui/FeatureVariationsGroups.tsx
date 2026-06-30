import { useMemo, useState } from 'react'
import type { Font } from 'opentype.js'
import type { VariationAxis } from '../core/variations'
import { toUserCoord, type AvarSegments } from '../core/coords'
import type { AxisRange, RvrnGroup } from '../core/featureVariations'
import type { OutlineFont } from '../core/shape'
import { GlyphOutline } from './GlyphOutline'

const INITIAL = 24
const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100
  return Number.isInteger(r) ? r.toFixed(0) : String(r)
}
const condKey = (set: AxisRange[]): string => set.map((c) => `${c.tag}:${c.min}:${c.max}`).join('|')

/** "slnt −15, CRSV 1" — the axes the apply-coords action moves off their default. */
function applyDescription(coords: Record<string, number>, axisByTag: Map<string, VariationAxis>): string {
  const parts = Object.entries(coords)
    .filter(([tag, v]) => v !== axisByTag.get(tag)?.default)
    .map(([tag, v]) => `${tag} ${fmt(v)}`)
  return parts.length ? parts.join(', ') : 'the default coordinates'
}

/**
 * Conditional substitutions from GSUB FeatureVariations (rvrn): which glyphs the
 * font swaps for a variant when the design coordinate enters a range. Rendered
 * INSIDE the substituted feature's card (so it's reachable via the feature nav).
 * Affected glyphs are shown as base → variant outline pairs (the variants are
 * non-cmapped). Condition ranges are shown in user-space axis values.
 */
export function FeatureVariationsGroups({
  font,
  axes,
  avar,
  groups,
  size = 30,
  applyByLookup,
  onApply,
  outline,
  coords,
}: {
  font: Font
  axes: VariationAxis[]
  avar: AvarSegments
  groups: RvrnGroup[]
  size?: number
  applyByLookup: Map<number, Record<string, number>>
  onApply: (coords: Record<string, number>) => void
  outline?: OutlineFont
  coords?: Record<string, number>
}) {
  const axisByTag = useMemo(() => new Map(axes.map((a) => [a.tag, a])), [axes])
  // Point the shared HB outline font at the current coords once, before the tiles
  // render below (React renders parent-before-child, so the GlyphOutlines read it).
  if (outline && coords) outline.setVariations(coords)

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Conditional substitutions — glyphs the font swaps for a variant when the variation
        coordinate enters a range. Use “apply coordinates” (or drag the axis sliders into a listed
        range) to see them in the proofs.
      </p>
      {groups.map((g) => (
        <Group
          key={g.lookupIndex}
          font={font}
          group={g}
          axisByTag={axisByTag}
          avar={avar}
          size={size}
          apply={applyByLookup.get(g.lookupIndex)}
          onApply={onApply}
          outline={outline}
          coords={coords}
        />
      ))}
    </div>
  )
}

function Group({
  font,
  group,
  axisByTag,
  avar,
  size,
  apply,
  onApply,
  outline,
  coords,
}: {
  font: Font
  group: RvrnGroup
  axisByTag: Map<string, VariationAxis>
  avar: AvarSegments
  size: number
  apply?: Record<string, number>
  onApply: (coords: Record<string, number>) => void
  outline?: OutlineFont
  coords?: Record<string, number>
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? group.pairs : group.pairs.slice(0, INITIAL)
  const glyphSize = Math.min(size, 30)

  const sets = useMemo(() => {
    const seen = new Set<string>()
    return group.conditionSets.filter((s) => {
      const k = condKey(s)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [group.conditionSets])

  // Normalized condition range → user-space "lo…hi" (ordered low to high).
  const userRange = (c: AxisRange): string => {
    const axis = axisByTag.get(c.tag)
    if (!axis) return `${fmt(c.min)}…${fmt(c.max)}`
    const a = toUserCoord(axis, avar, c.min)
    const b = toUserCoord(axis, avar, c.max)
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return `${fmt(lo)}…${fmt(hi)}`
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {group.label && (
          <span className="text-neutral-700 dark:text-neutral-200">
            → <span className="font-medium">{group.label}</span> forms
          </span>
        )}
        <span className="text-neutral-400 dark:text-neutral-600">
          {group.pairs.length} glyph{group.pairs.length === 1 ? '' : 's'}
        </span>
        {apply && (
          <button
            onClick={() => onApply(apply)}
            title={`Set ${applyDescription(apply, axisByTag)} so this substitution shows in the proofs`}
            className="ml-auto text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Apply coordinates
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {sets.map((set, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-neutral-400 dark:text-neutral-600">when</span>
            {set.length === 0 ? (
              <span className="text-neutral-400 dark:text-neutral-600">always</span>
            ) : (
              set.map((c, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  {j > 0 && (
                    <span className="text-[10px] uppercase text-neutral-400 dark:text-neutral-600">and</span>
                  )}
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                    <code className="font-mono uppercase text-indigo-600 dark:text-indigo-300">
                      {c.tag || `#${c.axisIndex}`}
                    </code>
                    <span className="ml-1.5 tabular-nums text-neutral-600 dark:text-neutral-300">
                      {userRange(c)}
                    </span>
                  </span>
                </span>
              ))
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {shown.map((p) => (
          <div
            key={p.inGid}
            className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
            title={`${font.glyphs.get(p.inGid)?.name ?? p.inGid} → ${font.glyphs.get(p.outGid)?.name ?? p.outGid}`}
          >
            <span className="flex items-center gap-1">
              <GlyphOutline font={font} gid={p.inGid} size={glyphSize} outline={outline} coords={coords} className="text-neutral-400 dark:text-neutral-600" />
              <span className="text-[10px] text-neutral-400 dark:text-neutral-600">→</span>
              <GlyphOutline font={font} gid={p.outGid} size={glyphSize} outline={outline} coords={coords} className="text-neutral-900 dark:text-neutral-100" />
            </span>
          </div>
        ))}
      </div>

      {group.pairs.length > INITIAL && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAll ? 'Show fewer' : `Show all ${group.pairs.length}`}
        </button>
      )}
    </div>
  )
}
