import type { Font } from 'opentype.js'
import type { FeatureInfo } from '../types'
import { coverageGlyphs, resolveLookup } from '../glyphs'

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

/**
 * Reconstruct the input component sequences of a ligature feature (GSUB type 4).
 * Each Ligature Substitution subtable pairs a Coverage of first components with
 * parallel ligature sets; a full sequence is [firstComponent, ...components],
 * mapped back to characters via the inverted cmap. Sequences with a component
 * that has no Unicode mapping are skipped (can't be produced from text input).
 */
export function reconstructLigatures(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
): string[] {
  const gsub = (font.tables as Record<string, GsubTable | undefined>).gsub
  const lookups = gsub?.lookups ?? []

  const lookupIndexes = new Set<number>()
  for (const occurrence of feature.occurrences) {
    for (const li of occurrence.lookupIndexes) lookupIndexes.add(li)
  }

  const firstChar = (gid: number): string | null => {
    const codePoints = reverse.get(gid)
    return codePoints && codePoints.length ? String.fromCodePoint(codePoints[0]) : null
  }

  const sequences: string[] = []
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
          const chars = gids.map(firstChar)
          if (chars.some((c) => c === null)) continue
          const sequence = chars.join('')
          if (!seen.has(sequence)) {
            seen.add(sequence)
            sequences.push(sequence)
          }
        }
      }
    }
  }

  sequences.sort((a, b) => a.length - b.length || a.localeCompare(b))
  return sequences
}
