import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { coverageGlyphs, resolveLookup } from './glyphs'

interface GsubTable {
  lookups?: { lookupType: number; subtables?: unknown[] }[]
}

interface Production {
  lookupIndex: number
  /** Input glyphs that produce the output (for single: 1; ligature: components). */
  inputs: number[]
}

export interface SubstGraph {
  /** output glyph id → ways it can be produced. */
  producedBy: Map<number, Production[]>
  /** lookup index → feature tags that reference it. */
  lookupFeatures: Map<number, string[]>
}

/** Build a glyph-level substitution graph from GSUB type 1/3/4 lookups. */
export function buildSubstGraph(font: Font, features: FeatureInfo[]): SubstGraph {
  const gsub = (font.tables as Record<string, GsubTable | undefined>).gsub
  const lookups = gsub?.lookups ?? []

  const lookupFeatures = new Map<number, string[]>()
  for (const f of features) {
    for (const occ of f.occurrences) {
      for (const li of occ.lookupIndexes) {
        const arr = lookupFeatures.get(li) ?? lookupFeatures.set(li, []).get(li)!
        if (!arr.includes(f.tag)) arr.push(f.tag)
      }
    }
  }

  const producedBy = new Map<number, Production[]>()
  const add = (out: number, lookupIndex: number, inputs: number[]) => {
    const arr = producedBy.get(out) ?? producedBy.set(out, []).get(out)!
    arr.push({ lookupIndex, inputs })
  }

  lookups.forEach((lookup, li) => {
    const { type, subtables } = resolveLookup(lookup)
    for (const st of subtables) {
      const coverage = st.coverage as Parameters<typeof coverageGlyphs>[0]
      const glyphs = coverageGlyphs(coverage)
      if (type === 1) {
        const substFormat = st.substFormat as number
        const delta = st.deltaGlyphId as number
        const substitute = st.substitute as number[] | undefined
        glyphs.forEach((g, i) => add(substFormat === 1 ? g + delta : substitute![i], li, [g]))
      } else if (type === 3) {
        const sets = st.alternateSets as number[][] | undefined
        glyphs.forEach((g, i) => (sets?.[i] ?? []).forEach((alt) => add(alt, li, [g])))
      } else if (type === 4) {
        const sets = st.ligatureSets as { ligGlyph: number; components: number[] }[][] | undefined
        glyphs.forEach((g, i) =>
          (sets?.[i] ?? []).forEach((lig) => add(lig.ligGlyph, li, [g, ...lig.components])),
        )
      }
    }
  })

  return { producedBy, lookupFeatures }
}

export interface ResolvedGlyph {
  /** Base characters that (with `features` enabled) produce this glyph. */
  chars: string
  /** Feature tags whose lookups must be on to produce it (empty if cmapped). */
  features: string[]
}

/**
 * Resolve a glyph id to base characters: directly via the inverted cmap, or — for
 * non-cmapped glyphs (alternates produced by earlier lookups, e.g. a contextual
 * feature's input) — by tracing the substitution graph back to cmapped inputs and
 * recording which features produce it.
 */
export function resolveGlyph(
  gid: number,
  reverse: Map<number, number[]>,
  graph: SubstGraph,
  seen: Set<number> = new Set(),
  depth = 0,
): ResolvedGlyph | null {
  const cps = reverse.get(gid)
  if (cps && cps.length) return { chars: String.fromCodePoint(cps[0]), features: [] }
  if (depth > 6 || seen.has(gid)) return null
  seen.add(gid)

  for (const production of graph.producedBy.get(gid) ?? []) {
    let chars = ''
    const features = new Set(graph.lookupFeatures.get(production.lookupIndex) ?? [])
    let ok = true
    for (const input of production.inputs) {
      const r = resolveGlyph(input, reverse, graph, seen, depth + 1)
      if (!r) {
        ok = false
        break
      }
      chars += r.chars
      for (const f of r.features) features.add(f)
    }
    if (ok) return { chars, features: [...features] }
  }
  return null
}
