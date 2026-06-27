import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { coverageGlyphs, resolveLookup } from './glyphs'
import { resolveGlyph, type SubstGraph } from './substitution'

interface GsubTable {
  lookups?: { lookupType: number; subtables?: unknown[] }[]
}

type Coverage = Parameters<typeof coverageGlyphs>[0]

export interface Trigger {
  /** Text that activates the contextual rule. */
  text: string
  /** Producer features (excluding the target) that must be on to form the input. */
  requiredFeatures: string[]
}

/**
 * Analytically derive trigger strings for a feature's contextual lookups
 * (Chaining/Contextual Substitution, type 5/6) by reading the rule's coverage
 * sequence — no brute-force search. Currently supports coverage-based Format 3
 * (verified common); other formats are skipped (caller falls back).
 *
 * Each position's glyph is resolved to base characters via the substitution graph
 * (so non-cmapped context glyphs — alternates produced by earlier lookups — are
 * traced back to typeable characters, recording the producer features).
 */
export function deriveTriggers(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  graph: SubstGraph,
): Trigger[] {
  const gsub = (font.tables as Record<string, GsubTable | undefined>).gsub
  const lookups = gsub?.lookups ?? []

  const lookupIndexes = new Set<number>()
  for (const occ of feature.occurrences) for (const li of occ.lookupIndexes) lookupIndexes.add(li)

  const triggers: Trigger[] = []
  const seenText = new Set<string>()

  for (const li of lookupIndexes) {
    const lookup = lookups[li]
    if (!lookup) continue
    const { type, subtables } = resolveLookup(lookup)
    if (type !== 5 && type !== 6) continue

    for (const st of subtables) {
      if (st.substFormat !== 3) continue // Format 3 (coverage-based) only for now
      const back = (st.backtrackCoverage ?? []) as Coverage[]
      const input = (st.inputCoverage ?? []) as Coverage[]
      const ahead = (st.lookaheadCoverage ?? []) as Coverage[]
      if (input.length === 0) continue

      const sequence: Coverage[] = [...[...back].reverse(), ...input, ...ahead]
      const resolved = sequence.map((cov) => {
        const g = coverageGlyphs(cov)[0]
        return g === undefined ? null : resolveGlyph(g, reverse, graph)
      })
      if (resolved.some((r) => !r)) continue

      const text = resolved.map((r) => r!.chars).join('')
      if (!text || seenText.has(text)) continue
      seenText.add(text)

      const required = new Set<string>()
      for (const r of resolved) for (const f of r!.features) if (f !== feature.tag) required.add(f)
      triggers.push({ text, requiredFeatures: [...required] })
      if (triggers.length >= 200) return triggers
    }
  }
  return triggers
}
