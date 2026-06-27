import type { Font } from 'opentype.js'
import type { FeatureInfo } from '../types'
import { coverageGlyphs, resolveLookup } from '../glyphs'
import { resolveGlyph, type SubstGraph } from '../substitution'

interface LigatureEntry {
  ligGlyph: number
  components: number[]
}
interface Type4Subtable {
  coverage?: unknown
  ligatureSets?: LigatureEntry[][]
}
interface GsubTable {
  lookups?: { lookupType: number; subtables?: unknown[] }[]
}

export interface LigatureReconstruction {
  /** Plain ligatures resolvable from cmapped text (e.g. "fi", "fl") — no prereqs. */
  sequences: string[]
  /**
   * Ligatures whose components are themselves produced by another feature (a
   * non-cmapped alternate — e.g. frac ligating aalt-made digit forms). Each
   * carries the producer feature(s) that must be on first; shown as a cascade.
   */
  cascades: { text: string; producers: string[] }[]
}

const NOT_DISPLAYABLE = /[\p{M}\p{Cf}\p{Cc}]/u

/**
 * Reconstruct the input component sequences of a ligature feature (GSUB type 4).
 * Each Ligature Substitution subtable pairs a Coverage of first components with
 * parallel ligature sets; a full sequence is [firstComponent, ...components].
 * Components are resolved cmap-first (a cmapped glyph keeps its own char, never
 * traced); only a NON-cmapped component is traced through the substitution graph
 * to its base char + producer feature. Plain (all-cmapped) ligatures are returned
 * separately from cascades (those needing a producer on) so a standard feature
 * like `liga` isn't turned into a producer-gated cascade by a few odd entries.
 * Sequences with an unresolvable/undisplayable component are skipped.
 */
export function reconstructLigatures(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  graph: SubstGraph,
): LigatureReconstruction {
  const gsub = (font.tables as Record<string, GsubTable | undefined>).gsub
  const lookups = gsub?.lookups ?? []

  const lookupIndexes = new Set<number>()
  for (const occurrence of feature.occurrences) {
    for (const li of occurrence.lookupIndexes) lookupIndexes.add(li)
  }

  const sequences: string[] = []
  const cascades: { text: string; producers: string[] }[] = []
  const seen = new Set<string>()

  for (const li of lookupIndexes) {
    const lookup = lookups[li]
    if (!lookup) continue
    const { type, subtables } = resolveLookup(lookup)
    if (type !== 4) continue

    for (const subtable of subtables as Type4Subtable[]) {
      const firstGlyphs = coverageGlyphs(subtable.coverage as Parameters<typeof coverageGlyphs>[0])
      const sets = subtable.ligatureSets ?? []
      for (let i = 0; i < firstGlyphs.length; i++) {
        const first = firstGlyphs[i]
        for (const lig of sets[i] ?? []) {
          const gids = [first, ...(lig.components ?? [])]
          const parts = gids.map((g) => resolveGlyph(g, reverse, graph, { excludeTag: feature.tag }))
          if (parts.some((p) => !p || p.chars === '' || NOT_DISPLAYABLE.test(p.chars))) continue
          const producers = new Set<string>()
          const text = parts
            .map((p) => {
              for (const f of p!.features) producers.add(f)
              return p!.chars
            })
            .join('')
          if (seen.has(text)) continue
          seen.add(text)
          if (producers.size === 0) sequences.push(text)
          else cascades.push({ text, producers: [...producers] })
        }
      }
    }
  }

  sequences.sort((a, b) => a.length - b.length || a.localeCompare(b))
  return { sequences, cascades }
}
