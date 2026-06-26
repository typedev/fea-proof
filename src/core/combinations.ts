import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { affectedInputChars } from './features/single'
import { featureName, isDefaultOn } from './registry'

export interface FeatureToggle {
  tag: string
  name: string
  defaultOn: boolean
  /** Min lookup index — features apply in LookupList order; chips sort by this. */
  order: number
}

export interface CombinationGroup {
  /** Base characters that are all affected by exactly this set of features. */
  chars: string[]
  /** The features affecting these chars, in application (lookup) order. */
  features: FeatureToggle[]
}

const EXCLUDE = new Set(['aalt', 'salt', 'ccmp'])

// Figure features whose input glyphs are non-cmapped alternates: assign the
// digits they conceptually act on so they participate in combinations.
const DIGITS = '0123456789'.split('')
const FIGURE_CHARS: Record<string, string[]> = {
  onum: DIGITS,
  lnum: DIGITS,
  pnum: DIGITS,
  tnum: DIGITS,
  dnom: DIGITS,
  numr: DIGITS,
  afrc: DIGITS,
  frac: DIGITS,
  zero: ['0'],
}

function minLookupIndex(feature: FeatureInfo): number {
  let min = Infinity
  for (const occ of feature.occurrences) {
    for (const li of occ.lookupIndexes) if (li < min) min = li
  }
  return min === Infinity ? 0 : min
}

/**
 * Find base glyphs that several features can transform, so they can be explored
 * as stacked combinations (e.g. a "0" touched by zero + onum + ssXX). Detection
 * is by shared affected character; the browser shaper applies any enabled subset
 * in correct LookupList order, so no cascade graph is needed.
 */
export function findCombinations(
  font: Font,
  features: FeatureInfo[],
  reverse: Map<number, number[]>,
): CombinationGroup[] {
  const charToTags = new Map<string, Set<string>>()
  const order = new Map<string, number>()

  for (const feature of features) {
    if (!feature.tables.includes('GSUB') || feature.ignored || EXCLUDE.has(feature.tag)) continue
    if (!feature.gsubLookupTypes.includes(1)) continue // single-sub only (per-char)

    let chars = affectedInputChars(font, feature, reverse)
    if (chars.length === 0) chars = FIGURE_CHARS[feature.tag] ?? []
    if (chars.length === 0) continue

    order.set(feature.tag, minLookupIndex(feature))
    for (const ch of chars) {
      const set = charToTags.get(ch) ?? charToTags.set(ch, new Set()).get(ch)!
      set.add(feature.tag)
    }
  }

  // Group chars that share an identical feature-set (≥2 features to combine).
  const groups = new Map<string, { chars: string[]; tags: string[] }>()
  for (const [ch, tags] of charToTags) {
    if (tags.size < 2) continue
    const sorted = [...tags].sort()
    const key = sorted.join(',')
    const group = groups.get(key) ?? groups.set(key, { chars: [], tags: sorted }).get(key)!
    group.chars.push(ch)
  }

  const result: CombinationGroup[] = [...groups.values()].map((g) => ({
    chars: g.chars.sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!),
    features: g.tags
      .map((tag) => ({
        tag,
        name: featureName(tag),
        defaultOn: isDefaultOn(tag),
        order: order.get(tag) ?? 0,
      }))
      .sort((a, b) => a.order - b.order),
  }))

  // Most features first, then biggest char groups.
  result.sort((a, b) => b.features.length - a.features.length || b.chars.length - a.chars.length)
  return result
}
