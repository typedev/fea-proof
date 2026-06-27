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

type Script = 'latn' | 'cyrl' | 'grek'

// Common letters per script, in preference order — to pick a readable
// representative from a broad coverage/class (e.g. "any letter") instead of the
// arbitrary first glyph (often Cyrillic by glyph order → confusing "юA").
const PREF_BY_SCRIPT: Record<Script, number[]> = {
  latn: [...'oneasitrlcdumhpbg'].map((c) => c.codePointAt(0)!),
  cyrl: [...'оаентилсрвкмдп'].map((c) => c.codePointAt(0)!),
  grek: [...'οαεντισ'].map((c) => c.codePointAt(0)!),
}

function scriptOfCp(cp: number): Script | null {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) return 'latn'
  if (cp >= 0x400 && cp <= 0x4ff) return 'cyrl'
  if (cp >= 0x370 && cp <= 0x3ff) return 'grek'
  return null
}

/**
 * A readable representative glyph from a coverage: prefer a common letter of the
 * given script (so context for a Cyrillic target uses Cyrillic, not Latin).
 */
function chooseRep(glyphs: number[], reverse: Map<number, number[]>, script?: Script): number | undefined {
  if (glyphs.length <= 1) return glyphs[0]
  const cpOf = (g: number) => reverse.get(g)?.[0]
  const prefs = script ? [PREF_BY_SCRIPT[script]] : [PREF_BY_SCRIPT.latn, PREF_BY_SCRIPT.cyrl, PREF_BY_SCRIPT.grek]
  for (const pref of prefs) for (const want of pref) for (const g of glyphs) if (cpOf(g) === want) return g
  for (const g of glyphs) {
    const cp = cpOf(g)
    if (cp !== undefined && scriptOfCp(cp) && (!script || scriptOfCp(cp) === script)) return g
  }
  for (const g of glyphs) {
    const cp = cpOf(g)
    if (cp !== undefined && scriptOfCp(cp)) return g
  }
  return glyphs[0]
}

const scriptOfGlyph = (g: number | undefined, reverse: Map<number, number[]>): Script | undefined => {
  if (g === undefined) return undefined
  const cp = reverse.get(g)?.[0]
  return cp !== undefined ? scriptOfCp(cp) ?? undefined : undefined
}

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
function classRep(
  cd: ClassDef | undefined,
  c: number,
  fallback: number,
  reverse: Map<number, number[]>,
  script?: Script,
): number {
  if (c === 0 || !cd) return fallback
  const glyphs: number[] = []
  if (cd.format === 1 && cd.classes) {
    for (let i = 0; i < cd.classes.length; i++) if (cd.classes[i] === c) glyphs.push((cd.startGlyph ?? 0) + i)
  }
  if (cd.format === 2 && cd.ranges) {
    for (const r of cd.ranges) if (r.classId === c) for (let g = r.start; g <= r.end; g++) glyphs.push(g)
  }
  return chooseRep(glyphs, reverse, script) ?? fallback
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
  reverse: Map<number, number[]>,
): number[][] {
  const seqs: number[][] = []

  if (st.substFormat === 3) {
    const inputCovs = (type === 6 ? st.inputCoverage : st.coverages) ?? []
    const input = inputCovs.map((c) => chooseRep(coverageGlyphs(c), reverse))
    if (!input.length) return seqs
    // Context (backtrack/lookahead) uses the input's script so reps don't mix
    // scripts (Cyrillic target → Cyrillic context, not Latin).
    const script = input.map((g) => scriptOfGlyph(g, reverse)).find(Boolean)
    if (type === 6) {
      const back = (st.backtrackCoverage ?? []).map((c) => chooseRep(coverageGlyphs(c), reverse, script))
      const ahead = (st.lookaheadCoverage ?? []).map((c) => chooseRep(coverageGlyphs(c), reverse, script))
      seqs.push([...back.reverse(), ...input, ...ahead].filter((g): g is number => g !== undefined))
    } else {
      seqs.push(input.filter((g): g is number => g !== undefined))
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
        const first = chooseRep(cov.filter((g) => classOf(icd, g) === c), reverse) ?? classRep(icd, c, fallback, reverse)
        const script = scriptOfGlyph(first, reverse)
        for (const rule of rules) {
          seqs.push([
            ...(rule.backtrack ?? []).slice().reverse().map((cl) => classRep(st.backtrackClassDef, cl, fallback, reverse, script)),
            first,
            ...(rule.input ?? []).map((cl) => classRep(icd, cl, fallback, reverse)),
            ...(rule.lookahead ?? []).map((cl) => classRep(st.lookaheadClassDef, cl, fallback, reverse, script)),
          ])
        }
      })
    } else {
      const cd = st.classDef
      ;(st.classSets ?? []).forEach((rules, c) => {
        if (!rules) return
        const first = chooseRep(cov.filter((g) => classOf(cd, g) === c), reverse) ?? classRep(cd, c, fallback, reverse)
        for (const rule of rules) {
          seqs.push([first, ...(rule.classes ?? []).map((cl) => classRep(cd, cl, fallback, reverse))])
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
      for (const seq of subtableSequences(st, type, fallback, reverse)) {
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
