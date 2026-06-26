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

  const coverageString = () => ({
    text: [...chars].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join(''),
    usedCoverage: true,
  })

  const letters = chars.filter((c) => reLetter.test(c))
  if (letters.length === 0) return coverageString()

  const script = dominantScript(chars)
  const pool = (script && bank[script]) || []
  if (pool.length === 0) return coverageString()

  // Render uppercase when the affected characters are mostly uppercase
  // (e.g. c2sc / case operate on capitals; frequency words are lowercase).
  const uppercaseCount = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length
  const toUpper = uppercaseCount / letters.length > 0.6

  const target = new Set(chars.map((c) => c.toLowerCase()))
  const remaining = new Set(target)
  const chosen: string[] = []
  let total = 0

  for (const word of pool) {
    if (chosen.length >= maxWords || remaining.size === 0 || total >= maxChars) break
    if (!reLetter.test(word[0])) continue // skip tokens like "'s"
    let covers = false
    for (const ch of word) {
      if (remaining.has(ch.toLowerCase())) {
        covers = true
        break
      }
    }
    if (!covers) continue
    chosen.push(word)
    total += word.length + 1
    for (const ch of word) remaining.delete(ch.toLowerCase())
  }

  // Context fill: add a few more words containing affected chars for readability,
  // even once everything is covered (so single-char features aren't one tiny word).
  if (chosen.length < minWords) {
    const chosenSet = new Set(chosen)
    for (const word of pool) {
      if (chosen.length >= minWords || total >= maxChars) break
      if (chosenSet.has(word) || !reLetter.test(word[0])) continue
      if (![...word].some((ch) => target.has(ch.toLowerCase()))) continue
      chosen.push(word)
      chosenSet.add(word)
      total += word.length + 1
    }
  }

  if (chosen.length === 0) return coverageString()

  const text = chosen.map((w) => (toUpper ? w.toUpperCase() : w)).join(' ')
  return { text, usedCoverage: false }
}

/**
 * Build a "living" sample for ligature sequences: real words that contain the
 * sequences (case-sensitive, so capital-only ligatures like "Th" don't match
 * lowercase words), plus any sequences no word covered, shown bare. Falls back
 * to bare sequences when no wordlist is available.
 */
export function pickLigatureSample(
  sequences: string[],
  pool: string[],
  options: { maxWords?: number; maxBare?: number } = {},
): SampleResult {
  const maxWords = options.maxWords ?? 6
  const maxBare = options.maxBare ?? 8

  if (sequences.length === 0) return { text: '', usedCoverage: true }

  const words: string[] = []
  const covered = new Set<string>()

  if (pool.length > 0) {
    for (const sequence of sequences) {
      if (words.length >= maxWords) break
      if (covered.has(sequence)) continue
      const word = pool.find((w) => w.length <= 14 && w.includes(sequence))
      if (!word || words.includes(word)) continue
      words.push(word)
      for (const s of sequences) if (word.includes(s)) covered.add(s)
    }
  }

  const bare = sequences.filter((s) => !covered.has(s)).slice(0, maxBare)
  const parts = [...words, ...bare]
  if (parts.length === 0) return { text: sequences.slice(0, maxBare).join('  '), usedCoverage: true }
  return { text: parts.join('  '), usedCoverage: words.length === 0 }
}
