import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { inputGlyphsForLookups } from './features/single'
import { reconstructLigatures } from './features/ligature'
import { resolveGlyph, type SubstGraph } from './substitution'
import { deriveTriggers } from './context'
import { featureName, isDefaultOn } from './registry'
import type { Shaper } from './shape'

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

// Own grids / not combinable: alternates, invisible composition, language forms.
const EXCLUDE = new Set(['aalt', 'salt', 'ccmp', 'locl'])

const DIGITS = '0123456789'.split('')
const FIGURE_TAGS = new Set(['onum', 'lnum', 'pnum', 'tnum', 'dnom', 'numr', 'zero'])

const NOT_DISPLAYABLE = /[\p{M}\p{Cf}\p{Cc}\s]/u
const MAX_FRAGMENTS_PER_GROUP = 24
const MAX_FRAGMENTS = 700

function minLookupIndex(feature: FeatureInfo): number {
  let min = Infinity
  for (const occ of feature.occurrences) {
    for (const li of occ.lookupIndexes) if (li < min) min = li
  }
  return min === Infinity ? 0 : min
}

function shapeSig(shaper: Shaper, text: string, features: string[]): string {
  return shaper.shape(text, { features }).map((g) => `${g.g}:${g.ax}`).join(',')
}

/**
 * Find text fragments (chars OR sequences) that several features can transform,
 * grouped for interactive stacking. Candidate fragments come from every feature
 * kind — single chars, ligature/cascade sequences, and contextual triggers.
 *
 * With a shaper, each fragment's actual feature set is determined by shaping
 * (alone + with-prerequisites passes), so contextual, ligature and cross-feature
 * cascades all participate, in LookupList order, with no hard-coded chains.
 * Falls back to structural membership when no shaper is available.
 */
export function findCombinations(
  font: Font,
  features: FeatureInfo[],
  reverse: Map<number, number[]>,
  graph: SubstGraph,
  shaper?: Shaper,
): CombinationGroup[] {
  const order = new Map<string, number>()
  const featureFrags = new Map<string, Set<string>>() // tag → fragments it touches
  const singleChars = new Map<string, Set<string>>() // tag → single-char touches
  const allFragments = new Set<string>()

  const credit = (tag: string, fragment: string) => {
    if (!fragment || EXCLUDE.has(tag) || NOT_DISPLAYABLE.test(fragment)) return
    allFragments.add(fragment)
    ;(featureFrags.get(tag) ?? featureFrags.set(tag, new Set()).get(tag)!).add(fragment)
    if ([...fragment].length === 1) {
      ;(singleChars.get(tag) ?? singleChars.set(tag, new Set()).get(tag)!).add(fragment)
    }
  }
  const ensureOrder = (tag: string) => {
    if (!order.has(tag)) order.set(tag, minLookupIndex(features.find((f) => f.tag === tag) ?? features[0]))
  }

  for (const feature of features) {
    if (!feature.tables.includes('GSUB') || feature.ignored || EXCLUDE.has(feature.tag)) continue
    order.set(feature.tag, minLookupIndex(feature))

    if (FIGURE_TAGS.has(feature.tag)) {
      for (const d of DIGITS) credit(feature.tag, d)
      continue
    }

    const lookupIndexes = new Set<number>()
    for (const occ of feature.occurrences) for (const li of occ.lookupIndexes) lookupIndexes.add(li)

    if (feature.gsubLookupTypes.includes(4)) {
      const { sequences, producers } = reconstructLigatures(font, feature, reverse, graph)
      for (const seq of sequences) {
        credit(feature.tag, seq)
        for (const p of producers) {
          ensureOrder(p)
          credit(p, seq)
        }
      }
    }
    if (feature.gsubLookupTypes.includes(1)) {
      for (const g of inputGlyphsForLookups(font, lookupIndexes)) {
        const r = resolveGlyph(g, reverse, graph, { preferProduced: true, excludeTag: feature.tag })
        if (!r) continue
        credit(feature.tag, r.chars)
        for (const p of r.features) {
          ensureOrder(p)
          credit(p, r.chars)
        }
      }
    }
    if (feature.gsubLookupTypes.some((t) => t === 5 || t === 6)) {
      for (const trigger of deriveTriggers(font, feature, reverse, graph)) {
        credit(feature.tag, trigger.text)
        for (const p of trigger.requiredFeatures) {
          ensureOrder(p)
          credit(p, trigger.text)
        }
      }
    }
  }

  // Candidate features per fragment: features touching it directly, plus single-char
  // features whose char appears inside a multi-char fragment.
  const candidates = new Map<string, Set<string>>()
  const addCand = (frag: string, tag: string) =>
    (candidates.get(frag) ?? candidates.set(frag, new Set()).get(frag)!).add(tag)
  for (const [tag, frags] of featureFrags) for (const frag of frags) addCand(frag, tag)
  for (const [tag, chars] of singleChars) {
    for (const frag of allFragments) {
      if (frag.length > 1) for (const c of chars) if (frag.includes(c)) addCand(frag, tag)
    }
  }

  // Only fragments with ≥2 candidates can form a combination; cap the work.
  const fragments = [...candidates.entries()]
    .filter(([, tags]) => tags.size >= 2)
    .sort((a, b) => a[0].length - b[0].length)
    .slice(0, MAX_FRAGMENTS)

  const candTags = [...featureFrags.keys()]
  const allOff = candTags.map((t) => `${t}=0`)
  const withOn = (base: string[], tag: string) => base.map((x) => (x.startsWith(`${tag}=`) ? `${tag}=1` : x))

  const groups = new Map<string, { chars: string[]; tags: string[] }>()
  for (const [frag, candSet] of fragments) {
    const list = [...candSet]
    let relevant: string[]
    if (shaper) {
      try {
        const baseSig = shapeSig(shaper, frag, allOff)
        const alone = list.filter((t) => shapeSig(shaper, frag, withOn(allOff, t)) !== baseSig)
        const aloneSet = new Set(alone)
        const active = candTags.map((t) => (aloneSet.has(t) ? `${t}=1` : `${t}=0`))
        const activeSig = shapeSig(shaper, frag, active)
        const dependent = list.filter(
          (t) => !aloneSet.has(t) && shapeSig(shaper, frag, withOn(active, t)) !== activeSig,
        )
        relevant = [...new Set([...alone, ...dependent])]
      } catch {
        relevant = list
      }
    } else {
      relevant = list
    }
    if (relevant.length < 2) continue
    const key = relevant.slice().sort().join(',')
    const group = groups.get(key) ?? groups.set(key, { chars: [], tags: relevant }).get(key)!
    group.chars.push(frag)
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
