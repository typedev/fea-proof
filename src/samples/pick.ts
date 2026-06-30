import type { Script } from './languages'

const reLatin = /\p{Script=Latin}/u
const reCyrillic = /\p{Script=Cyrillic}/u
const reGreek = /\p{Script=Greek}/u
const reLetter = /\p{L}/u

export function classifyScript(ch: string): Script | null {
  if (reLatin.test(ch)) return 'latn'
  if (reCyrillic.test(ch)) return 'cyrl'
  if (reGreek.test(ch)) return 'grek'
  return null
}

function dominantScript(chars: string[]): Script | null {
  const counts: Record<Script, number> = { latn: 0, cyrl: 0, grek: 0 }
  for (const ch of chars) {
    const s = classifyScript(ch)
    if (s) counts[s]++
  }
  const entries = (Object.entries(counts) as [Script, number][]).filter(([, n]) => n > 0)
  if (entries.length === 0) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

export interface SampleResult {
  /** Text to render in the before/after preview. */
  text: string
  /** True when no words matched and we fell back to a glyph-coverage string. */
  usedCoverage: boolean
}

export interface PickOptions {
  minWords?: number
  maxWords?: number
  maxChars?: number
  /** Rotate the word pool by this many positions before picking, so different
   *  features don't all surface the same top-frequency words. */
  offset?: number
  /** Prefer words at least this long — the very top of a frequency list is
   *  mostly 2–3 letter function words (si, no, ja, di) which read as noise.
   *  Shorter words are still used as a fallback to cover an otherwise-orphan
   *  character. */
  minLen?: number
  /** Code points the font can render — words needing any other glyph are skipped
   *  (they'd fall back to a system font). Omit to disable the check. */
  supportedCps?: Set<number>
}

/** Rotate an array left by k (returns the same array when k is 0). */
function rotate<T>(arr: T[], k: number): T[] {
  if (arr.length === 0) return arr
  const n = ((k % arr.length) + arr.length) % arr.length
  return n === 0 ? arr : [...arr.slice(n), ...arr.slice(0, n)]
}

/**
 * Whether the font can render every code point of `word` directly (has a cmap
 * entry for each). A word with even one uncovered glyph would fall back to a
 * system font and look broken, so such words are rejected from samples. An
 * absent/empty support set means "unknown" — don't filter (keeps old behaviour).
 */
export function coverable(word: string, supported?: Set<number>): boolean {
  if (!supported || supported.size === 0) return true
  for (const ch of word) if (!supported.has(ch.codePointAt(0)!)) return false
  return true
}

/** Stable small hash of a string, for deriving a per-feature pool offset. */
export function tagOffset(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  return h
}

/**
 * Build a "living" sample for a set of affected characters: real words from the
 * matching script that contain those characters, greedily chosen (frequency
 * order) to cover as many of them as possible. Falls back to a glyph-coverage
 * string when no readable words apply (e.g. digit- or punctuation-only features).
 */
export function pickSample(
  chars: string[],
  bank: Record<string, string[]>,
  options: PickOptions = {},
): SampleResult {
  const minWords = options.minWords ?? 3
  const maxWords = options.maxWords ?? 6
  const maxChars = options.maxChars ?? 56
  const minLen = options.minLen ?? 4
  const cps = options.supportedCps

  const coverageString = () => ({
    text: [...chars].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join(''),
    usedCoverage: true,
  })

  const letters = chars.filter((c) => reLetter.test(c))
  if (letters.length === 0) return coverageString()

  const script = dominantScript(chars)
  const basePool = (script && bank[script]) || []
  if (basePool.length === 0) return coverageString()
  const pool = rotate(basePool, options.offset ?? 0)

  // Render uppercase when the affected characters are mostly uppercase
  // (e.g. c2sc / case operate on capitals; frequency words are lowercase).
  const uppercaseCount = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length
  const toUpper = uppercaseCount / letters.length > 0.6

  const target = new Set(chars.map((c) => c.toLowerCase()))
  const remaining = new Set(target)
  const chosen: string[] = []
  const chosenSet = new Set<string>()
  let total = 0

  const take = (word: string) => {
    chosen.push(word)
    chosenSet.add(word)
    total += word.length + 1
    for (const ch of word) remaining.delete(ch.toLowerCase())
  }

  // Pass 1: greedy coverage, but only words of a decent length (skip 2–3 letter
  // function words that read as noise). Pass 2 below rescues any char that only
  // short words can cover.
  for (const minWordLen of [minLen, 1]) {
    for (const word of pool) {
      if (chosen.length >= maxWords || remaining.size === 0 || total >= maxChars) break
      if (word.length < minWordLen || chosenSet.has(word)) continue
      if (!reLetter.test(word[0])) continue // skip tokens like "'s"
      if (!coverable(word, cps)) continue // skip words the font can't fully render
      if (![...word].some((ch) => remaining.has(ch.toLowerCase()))) continue
      take(word)
    }
    if (remaining.size === 0) break
  }

  // Context fill: add a few more (long) words containing affected chars for
  // readability, even once everything is covered (so single-char features aren't
  // one tiny word).
  if (chosen.length < minWords) {
    for (const word of pool) {
      if (chosen.length >= minWords || total >= maxChars) break
      if (word.length < minLen || chosenSet.has(word) || !reLetter.test(word[0])) continue
      if (!coverable(word, cps)) continue
      if (![...word].some((ch) => target.has(ch.toLowerCase()))) continue
      take(word)
    }
  }

  if (chosen.length === 0) return coverageString()

  const text = chosen.map((w) => (toUpper ? w.toUpperCase() : w)).join(' ')
  return { text, usedCoverage: false }
}

const LIG_SCAN_LIMIT = 40000

/**
 * Find a real word that forms a ligature sequence. Match is CASE-INSENSITIVE —
 * most ligature sets are uppercase (display faces: "AA", "AND", "TT") while
 * wordlists are lowercase, so a case-sensitive scan finds almost nothing. The
 * found word is then refitted to the sequence's case so the ligature actually
 * forms: an all-caps sequence uppercases the whole word ("android" → "ANDROID");
 * otherwise the exact sequence chars are spliced in at the match position
 * (preserves a lowercase word, handles mixed case like "Th" → "The"). Prefers a
 * word longer than the sequence (real context) over a bare-ish match.
 */
const reLower = /\p{Ll}/u
const reUpper = /\p{Lu}/u

export function findLigatureWord(seq: string, pool: string[], supportedCps?: Set<number>): string | null {
  const seqLower = seq.toLowerCase()
  const allUpper = seq !== seqLower && seq === seq.toUpperCase()
  const fit = (w: string, idx: number) =>
    allUpper ? w.toUpperCase() : w.slice(0, idx) + seq + w.slice(idx + seq.length)

  // Reject a splice that would put a lowercase letter directly left of an
  // uppercase one (e.g. "No" spliced into "piano" → "pia№"): only accept an
  // uppercase-initial sequence at a word boundary. Whole-word uppercasing
  // (allUpper) never creates such a seam.
  const seamOk = (w: string, idx: number) =>
    allUpper || idx === 0 || !reUpper.test(seq[0]) || !reLower.test(w[idx - 1])

  let fallback: string | null = null
  const limit = Math.min(pool.length, LIG_SCAN_LIMIT)
  for (let i = 0; i < limit; i++) {
    const w = pool[i]
    if (w.length > 14) continue
    const idx = w.toLowerCase().indexOf(seqLower)
    if (idx < 0 || !seamOk(w, idx)) continue
    const fitted = fit(w, idx)
    if (!coverable(fitted, supportedCps)) continue // word the font can't fully render
    if (w.length >= seq.length + 2) return fitted // long enough for context
    if (!fallback) fallback = fitted
  }
  return fallback
}

/**
 * Build a "living" sample for ligature sequences: real words that form the
 * sequences (see `findLigatureWord` — case-insensitive, case-refitted), plus any
 * sequences no word covered, shown bare. Falls back to bare sequences when no
 * wordlist is available.
 */
export function pickLigatureSample(
  sequences: string[],
  basePool: string[],
  options: { maxWords?: number; maxBare?: number; offset?: number; supportedCps?: Set<number> } = {},
): SampleResult {
  const maxWords = options.maxWords ?? 6
  const maxBare = options.maxBare ?? 8
  const pool = rotate(basePool, options.offset ?? 0)

  if (sequences.length === 0) return { text: '', usedCoverage: true }

  const words: string[] = []
  const covered = new Set<string>()

  if (pool.length > 0) {
    for (const sequence of sequences) {
      if (words.length >= maxWords) break
      if (covered.has(sequence)) continue
      const word = findLigatureWord(sequence, pool, options.supportedCps)
      if (!word || words.includes(word)) continue
      words.push(word)
      const lw = word.toLowerCase()
      for (const s of sequences) if (lw.includes(s.toLowerCase())) covered.add(s)
    }
  }

  const bare = sequences.filter((s) => !covered.has(s)).slice(0, maxBare)
  const parts = [...words, ...bare]
  if (parts.length === 0) return { text: sequences.slice(0, maxBare).join('  '), usedCoverage: true }
  return { text: parts.join('  '), usedCoverage: words.length === 0 }
}
