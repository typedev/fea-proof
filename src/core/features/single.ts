import type { Font } from 'opentype.js'
import type { FeatureInfo } from '../types'
import { coverageGlyphs, resolveLookup } from '../glyphs'

interface GsubTable {
  lookups?: { lookupType: number; subtables?: unknown[] }[]
}

/**
 * Collect the input characters of the given GSUB lookups that are reachable via
 * Single Substitution (type 1). Returns unique single-character strings, mapped
 * back to Unicode through the inverted cmap.
 */
export function inputCharsForLookups(
  font: Font,
  lookupIndexes: Iterable<number>,
  reverse: Map<number, number[]>,
): string[] {
  const gsub = (font.tables as Record<string, GsubTable | undefined>).gsub
  const lookups = gsub?.lookups ?? []
  const glyphIds = new Set<number>()

  for (const index of lookupIndexes) {
    const lookup = lookups[index]
    if (!lookup) continue
    const { type, subtables } = resolveLookup(lookup)
    if (type !== 1) continue
    for (const subtable of subtables) {
      const coverage = subtable.coverage as Parameters<typeof coverageGlyphs>[0]
      for (const gid of coverageGlyphs(coverage)) glyphIds.add(gid)
    }
  }

  // Combining marks, format and control characters can't be shown standalone
  // (they render as floating accents / nothing), so exclude them from samples.
  const notDisplayable = /[\p{M}\p{Cf}\p{Cc}]/u

  const chars: string[] = []
  const seen = new Set<string>()
  for (const gid of glyphIds) {
    for (const codePoint of reverse.get(gid) ?? []) {
      const ch = String.fromCodePoint(codePoint)
      if (notDisplayable.test(ch)) continue
      if (!seen.has(ch)) {
        seen.add(ch)
        chars.push(ch)
      }
    }
  }
  return chars
}

/** Union of single-sub input characters across all of a feature's occurrences. */
export function affectedInputChars(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
): string[] {
  const lookupIndexes = new Set<number>()
  for (const occurrence of feature.occurrences) {
    for (const li of occurrence.lookupIndexes) lookupIndexes.add(li)
  }
  return inputCharsForLookups(font, lookupIndexes, reverse)
}
