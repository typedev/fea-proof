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
    // Only GSUB features index into the GSUB lookup list (occurrences of a
    // GPOS-only feature like kern are GPOS indices — would mislabel GSUB lookups).
    if (!f.tables.includes('GSUB')) continue
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

export interface ResolveOptions {
  /** Don't credit this feature as a producer (it's the one being previewed). */
  excludeTag?: string
  /**
   * Prefer tracing through a producing feature over the glyph's own cmap entry —
   * but ONLY when that cmap entry is a Private Use Area codepoint (a "fake" encoding
   * for a derived glyph, e.g. PUA-encoded ligatures a stylistic set consumes). A
   * real cmap (e.g. 'A', '0') is always kept — otherwise a base letter that merely
   * happens to be an alternate's output would be mis-traced (turning c2sc into a
   * spurious aalt cascade).
   */
  preferProduced?: boolean
}

/** Private Use Area — a "fake" encoding often used for derived/internal glyphs. */
export const isPUA = (cp: number): boolean =>
  (cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd)

/**
 * Resolve a glyph id to base characters: via the inverted cmap, or — for glyphs
 * produced by earlier lookups (alternates / PUA-encoded ligatures) — by tracing
 * the substitution graph back to cmapped inputs, recording the producer features.
 */
export function resolveGlyph(
  gid: number,
  reverse: Map<number, number[]>,
  graph: SubstGraph,
  opts: ResolveOptions = {},
  seen: Set<number> = new Set(),
  depth = 0,
): ResolvedGlyph | null {
  const cps = reverse.get(gid)
  const cmap: ResolvedGlyph | null = cps && cps.length ? { chars: String.fromCodePoint(cps[0]), features: [] } : null

  const trace = (): ResolvedGlyph | null => {
    if (depth > 6 || seen.has(gid)) return null
    seen.add(gid)
    for (const production of graph.producedBy.get(gid) ?? []) {
      const producerFeats = (graph.lookupFeatures.get(production.lookupIndex) ?? []).filter(
        (t) => t !== opts.excludeTag,
      )
      let chars = ''
      const features = new Set(producerFeats)
      let ok = true
      for (const input of production.inputs) {
        const r = resolveGlyph(input, reverse, graph, opts, seen, depth + 1)
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

  if (opts.preferProduced) {
    // A real (non-PUA) cmap always wins; only trace PUA-encoded or uncmapped
    // glyphs that another feature produces.
    const realCmap = !!cps && cps.some((cp) => !isPUA(cp))
    if (!realCmap) {
      const hasOtherProducer = (graph.producedBy.get(gid) ?? []).some((p) =>
        (graph.lookupFeatures.get(p.lookupIndex) ?? []).some((t) => t !== opts.excludeTag),
      )
      if (hasOtherProducer) {
        const traced = trace()
        if (traced) return traced
      }
    }
    return cmap
  }

  return cmap ?? trace()
}
