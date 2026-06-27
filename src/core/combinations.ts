import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { inputGlyphsForLookups } from './features/single'
import { reconstructLigatures } from './features/ligature'
import { resolveGlyph, type SubstGraph } from './substitution'
import { featureName, isDefaultOn } from './registry'

export interface FeatureToggle {
  tag: string
  name: string
  defaultOn: boolean
  /** Min lookup index — features apply in LookupList order; chips sort by this. */
  order: number
}

export interface CombinationGroup {
  /** Text fragments (chars or sequences) all affected by exactly this feature set. */
  chars: string[]
  /** The features affecting these fragments, in application (lookup) order. */
  features: FeatureToggle[]
}

// Not toggled in combinations: alternates have their own grid; ccmp is invisible;
// locl is language-driven; aalt/salt are alternate grids.
const EXCLUDE = new Set(['aalt', 'salt', 'ccmp', 'locl'])

const DIGITS = '0123456789'.split('')
const FIGURE_TAGS = new Set(['onum', 'lnum', 'pnum', 'tnum', 'dnom', 'numr', 'afrc', 'frac', 'zero'])

const NOT_DISPLAYABLE = /[\p{M}\p{Cf}\p{Cc}\s]/u
const MAX_FRAGMENTS_PER_GROUP = 24

function minLookupIndex(feature: FeatureInfo): number {
  let min = Infinity
  for (const occ of feature.occurrences) {
    for (const li of occ.lookupIndexes) if (li < min) min = li
  }
  return min === Infinity ? 0 : min
}

/**
 * Find text fragments (single chars OR sequences) that several features can
 * transform, so they can be explored as stacked combinations. Fully general:
 * a single-sub input is resolved through the substitution graph — if it's a glyph
 * produced by another feature (e.g. a stylistic set restyling a ligature), it
 * resolves to base characters and the producer feature is credited too. Ligature
 * features contribute their component sequences. The browser shaper applies any
 * enabled subset in LookupList order, so no cascade is hard-coded.
 */
export function findCombinations(
  font: Font,
  features: FeatureInfo[],
  reverse: Map<number, number[]>,
  graph: SubstGraph,
): CombinationGroup[] {
  const fragTags = new Map<string, Set<string>>()
  const order = new Map<string, number>()

  const note = (fragment: string, tag: string) => {
    if (!fragment || EXCLUDE.has(tag) || NOT_DISPLAYABLE.test(fragment)) return
    const set = fragTags.get(fragment) ?? fragTags.set(fragment, new Set()).get(fragment)!
    set.add(tag)
  }

  for (const feature of features) {
    if (!feature.tables.includes('GSUB') || feature.ignored || EXCLUDE.has(feature.tag)) continue
    order.set(feature.tag, minLookupIndex(feature))

    // Figure features (inputs are often non-cmapped alternates): use digits.
    if (FIGURE_TAGS.has(feature.tag)) {
      for (const d of DIGITS) note(d, feature.tag)
      continue
    }

    const lookupIndexes = new Set<number>()
    for (const occ of feature.occurrences) for (const li of occ.lookupIndexes) lookupIndexes.add(li)

    // Ligature sequences.
    if (feature.gsubLookupTypes.includes(4)) {
      for (const seq of reconstructLigatures(font, feature, reverse)) note(seq, feature.tag)
    }

    // Single subs — resolve each input through the graph (char, or base sequence
    // + producer features for derived/PUA glyphs).
    if (feature.gsubLookupTypes.includes(1)) {
      for (const g of inputGlyphsForLookups(font, lookupIndexes)) {
        const r = resolveGlyph(g, reverse, graph, { preferProduced: true, excludeTag: feature.tag })
        if (!r) continue
        note(r.chars, feature.tag)
        for (const p of r.features) {
          if (!order.has(p)) order.set(p, minLookupIndex(features.find((f) => f.tag === p) ?? feature))
          note(r.chars, p)
        }
      }
    }
  }

  // Group fragments sharing an identical feature set (≥2 features to combine).
  const groups = new Map<string, { chars: string[]; tags: string[] }>()
  for (const [fragment, tags] of fragTags) {
    if (tags.size < 2) continue
    const sorted = [...tags].sort()
    const key = sorted.join(',')
    const group = groups.get(key) ?? groups.set(key, { chars: [], tags: sorted }).get(key)!
    group.chars.push(fragment)
  }

  const result: CombinationGroup[] = [...groups.values()].map((g) => ({
    chars: g.chars
      .sort((a, b) => a.length - b.length || a.codePointAt(0)! - b.codePointAt(0)!)
      .slice(0, MAX_FRAGMENTS_PER_GROUP),
    features: g.tags
      .map((tag) => ({ tag, name: featureName(tag), defaultOn: isDefaultOn(tag), order: order.get(tag) ?? 0 }))
      .sort((a, b) => a.order - b.order),
  }))

  result.sort((a, b) => b.features.length - a.features.length || b.chars.length - a.chars.length)
  return result
}
