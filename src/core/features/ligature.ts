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
  /** Input component sequences as base text (e.g. "fi", "0/00"). */
  sequences: string[]
  /**
   * Feature tags whose lookups must be on to produce the components — non-empty
   * when components are themselves derived glyphs (e.g. frac ligating aalt-made
   * digit forms). Such a feature is a cascade: enable producers, then the target.
   */
  producers: string[]
}

/**
 * Reconstruct the input component sequences of a ligature feature (GSUB type 4).
 * Each Ligature Substitution subtable pairs a Coverage of first components with
 * parallel ligature sets; a full sequence is [firstComponent, ...components].
 * Components are resolved to base characters through the substitution graph, so a
 * component that is itself produced by another feature (a non-cmapped alternate)
 * resolves to its base char and that producer feature is recorded. Sequences with
 * an unresolvable component are skipped (can't be produced from text input).
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
  const seen = new Set<string>()
  const producers = new Set<string>()

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
          const parts = gids.map((g) =>
            resolveGlyph(g, reverse, graph, { preferProduced: true, excludeTag: feature.tag }),
          )
          if (parts.some((p) => p === null)) continue
          const sequence = parts
            .map((p) => {
              for (const f of p!.features) producers.add(f)
              return p!.chars
            })
            .join('')
          if (!seen.has(sequence)) {
            seen.add(sequence)
            sequences.push(sequence)
          }
        }
      }
    }
  }

  sequences.sort((a, b) => a.length - b.length || a.localeCompare(b))
  return { sequences, producers: [...producers] }
}
