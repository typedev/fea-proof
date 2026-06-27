import type { Font } from 'opentype.js'
import type { FeatureInfo } from './types'
import { coverageGlyphs, resolveLookup } from './glyphs'
import { resolveGlyph, type SubstGraph } from './substitution'

interface GsubTable {
  lookups?: { lookupType: number; subtables?: unknown[] }[]
}

type Coverage = Parameters<typeof coverageGlyphs>[0]

interface ClassDef {
  format: number
  startGlyph?: number
  classes?: number[]
  ranges?: { start: number; end: number; classId: number }[]
}

interface Rule {
  backtrack?: number[]
  input?: number[]
  lookahead?: number[]
  classes?: number[]
}

interface ContextSubtable {
  substFormat: number
  coverage?: Coverage
  coverages?: Coverage[]
  // Format 1
  chainRuleSets?: Rule[][]
  ruleSets?: Rule[][]
  // Format 2
  classDef?: ClassDef
  backtrackClassDef?: ClassDef
  inputClassDef?: ClassDef
  lookaheadClassDef?: ClassDef
  chainClassSet?: Rule[][]
  classSets?: Rule[][]
  // Format 3
  backtrackCoverage?: Coverage[]
  inputCoverage?: Coverage[]
  lookaheadCoverage?: Coverage[]
}

export interface Trigger {
  text: string
  /** Producer features (excluding the target) that must be on to form the input. */
  requiredFeatures: string[]
}

const firstGlyph = (cov?: Coverage): number | undefined => coverageGlyphs(cov)[0]

function classOf(cd: ClassDef | undefined, g: number): number {
  if (!cd) return 0
  if (cd.format === 1 && cd.classes) {
    const i = g - (cd.startGlyph ?? 0)
    return i >= 0 && i < cd.classes.length ? cd.classes[i] : 0
  }
  if (cd.format === 2 && cd.ranges) {
    for (const r of cd.ranges) if (g >= r.start && g <= r.end) return r.classId
  }
  return 0
}

/** A representative glyph for a class (class 0 = "any" → fallback). */
function classRep(cd: ClassDef | undefined, c: number, fallback: number): number {
  if (c === 0 || !cd) return fallback
  if (cd.format === 1 && cd.classes) {
    for (let i = 0; i < cd.classes.length; i++) if (cd.classes[i] === c) return (cd.startGlyph ?? 0) + i
  }
  if (cd.format === 2 && cd.ranges) {
    for (const r of cd.ranges) if (r.classId === c) return r.start
  }
  return fallback
}

/** A cmapped common letter glyph, used to stand in for "any glyph" (class 0). */
function pickFallback(reverse: Map<number, number[]>): number {
  for (const cp of [111, 110, 101, 97]) {
    // o, n, e, a
    for (const [g, cps] of reverse) if (cps.includes(cp)) return g
  }
  for (const [g] of reverse) return g
  return 0
}

/** Build full glyph sequences (backtrack reversed + input + lookahead) for a subtable. */
function subtableSequences(
  st: ContextSubtable,
  type: number,
  fallback: number,
): number[][] {
  const seqs: number[][] = []

  if (st.substFormat === 3) {
    if (type === 6) {
      const back = (st.backtrackCoverage ?? []).map(firstGlyph)
      const input = (st.inputCoverage ?? []).map(firstGlyph)
      const ahead = (st.lookaheadCoverage ?? []).map(firstGlyph)
      if (input.length) seqs.push([...back.reverse(), ...input, ...ahead].filter((g): g is number => g !== undefined))
    } else {
      const input = (st.coverages ?? []).map(firstGlyph)
      if (input.length) seqs.push(input.filter((g): g is number => g !== undefined))
    }
    return seqs
  }

  if (st.substFormat === 1) {
    const cov = coverageGlyphs(st.coverage)
    const sets = (type === 6 ? st.chainRuleSets : st.ruleSets) ?? []
    cov.forEach((cg, i) => {
      for (const rule of sets[i] ?? []) {
        seqs.push(
          type === 6
            ? [...(rule.backtrack ?? []).slice().reverse(), cg, ...(rule.input ?? []), ...(rule.lookahead ?? [])]
            : [cg, ...(rule.input ?? [])],
        )
      }
    })
    return seqs
  }

  if (st.substFormat === 2) {
    const cov = coverageGlyphs(st.coverage)
    if (type === 6) {
      const icd = st.inputClassDef
      ;(st.chainClassSet ?? []).forEach((rules, c) => {
        if (!rules) return
        const first = cov.find((g) => classOf(icd, g) === c) ?? classRep(icd, c, fallback)
        for (const rule of rules) {
          seqs.push([
            ...(rule.backtrack ?? []).slice().reverse().map((cl) => classRep(st.backtrackClassDef, cl, fallback)),
            first,
            ...(rule.input ?? []).map((cl) => classRep(icd, cl, fallback)),
            ...(rule.lookahead ?? []).map((cl) => classRep(st.lookaheadClassDef, cl, fallback)),
          ])
        }
      })
    } else {
      const cd = st.classDef
      ;(st.classSets ?? []).forEach((rules, c) => {
        if (!rules) return
        const first = cov.find((g) => classOf(cd, g) === c) ?? classRep(cd, c, fallback)
        for (const rule of rules) {
          seqs.push([first, ...(rule.classes ?? []).map((cl) => classRep(cd, cl, fallback))])
        }
      })
    }
    return seqs
  }

  return seqs
}

/**
 * Analytically derive trigger strings for a feature's contextual lookups
 * (Chaining/Contextual Substitution, type 5/6) by reading each rule's glyph
 * sequence — backtrack + input + lookahead — across all three subtable formats
 * (1 glyph-based, 2 class-based, 3 coverage-based). No brute-force search.
 *
 * Each position's glyph is resolved to base characters via the substitution graph
 * (so non-cmapped context glyphs are traced back to typeable characters, recording
 * the producer features). Class 0 ("any") uses a common-letter fallback.
 */
export function deriveTriggers(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  graph: SubstGraph,
): Trigger[] {
  const gsub = (font.tables as Record<string, GsubTable | undefined>).gsub
  const lookups = gsub?.lookups ?? []
  const fallback = pickFallback(reverse)

  const lookupIndexes = new Set<number>()
  for (const occ of feature.occurrences) for (const li of occ.lookupIndexes) lookupIndexes.add(li)

  const triggers: Trigger[] = []
  const seenText = new Set<string>()

  for (const li of lookupIndexes) {
    const lookup = lookups[li]
    if (!lookup) continue
    const { type, subtables } = resolveLookup(lookup)
    if (type !== 5 && type !== 6) continue

    for (const st of subtables as unknown as ContextSubtable[]) {
      for (const seq of subtableSequences(st, type, fallback)) {
        if (seq.length === 0 || seq.some((g) => g === undefined)) continue
        const resolved = seq.map((g) => resolveGlyph(g, reverse, graph))
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
  }
  return triggers
}
