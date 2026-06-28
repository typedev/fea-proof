// Hover-spotlight data: a real-word before/after demo that exercises ONE
// affected glyph, built lazily when the user hovers a tile. The word bank is
// font-INDEPENDENT (language word pools), so it's cached globally and loaded on
// first hover; the only per-font dependency is the shaper (for the highlight
// diff), passed in from App.
//
// Two proof modes share the machinery:
//  - feature: before/after are font-feature-settings (e.g. ss01 off → on).
//  - locl:    before/after are font-language-override (default → localized).

import { changedRanges, type Shaper } from '../core/shape'
import { classifyScript, pickLigatureSample, findLigatureWord, type SampleResult } from './pick'
import { loadWordBank, type Script } from './languages'

const HB_SCRIPT: Record<Script, string> = { latn: 'Latn', cyrl: 'Cyrl', grek: 'Grek' }

let bankPromise: Promise<Record<string, string[]>> | null = null
function getBank(): Promise<Record<string, string[]>> {
  return (bankPromise ??= loadWordBank(['latn', 'cyrl', 'grek']))
}

/**
 * Convert a CSS `font-feature-settings` value (`"liga" 0, "ss01" 1`) to HarfBuzz
 * feature strings (`liga=0`, `ss01=1`) so the spotlight highlights with the exact
 * same toggles the card renders — one source of truth, no re-deriving the kind.
 */
export function cssToHbFeatures(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/"([A-Za-z0-9]{1,4})"\s+(\d+)/g)) out.push(`${m[1]}=${m[2]}`)
  return out
}

/** How to diff/render the before vs after sides of a spotlight. */
export type SpotlightProof =
  | { kind: 'feature'; before: string; after: string } // CSS font-feature-settings
  | { kind: 'locl'; bcp47?: string } // localized via font-language-override

export interface Spotlight {
  text: string
  highlightRanges?: [number, number][]
  /** True when no real word contains the glyph (bare-glyph fallback). */
  usedCoverage: boolean
}

const COVER_SCAN_LIMIT = 40000

/**
 * Which of these items actually have a real demo word — so tiles with no word
 * (e.g. exotic ligature pairs, symbol/figure ligatures) can be rendered as
 * non-interactive instead of popping a "same as the tile" bare proof. Lazy
 * (loads the cached bank); call when a grid mounts.
 */
export async function coveredItems(items: string[], isLigature: boolean): Promise<Set<string>> {
  const bank = await getBank()
  const has = new Set<string>()
  for (const item of items) {
    const script = classifyScript(item[0] ?? '')
    const pool = (script && bank[script]) || []
    if (pool.length === 0) continue
    // A multi-codepoint item is a sequence (ligature / restyled-ligature cascade
    // like Zhivov's "AA"→"AA.liga3"); it needs the whole sequence in a word, not
    // just its chars — so use the case-insensitive ligature matcher.
    if (isLigature || [...item].length > 1) {
      if (findLigatureWord(item, pool)) has.add(item)
    } else {
      const lc = item.toLowerCase()
      const limit = Math.min(pool.length, COVER_SCAN_LIMIT)
      for (let i = 0; i < limit; i++) {
        if (pool[i].toLowerCase().includes(lc)) {
          has.add(item)
          break
        }
      }
    }
  }
  return has
}

function rotate<T>(arr: T[], k: number): T[] {
  if (k <= 0 || arr.length === 0) return arr
  const n = k % arr.length
  return n === 0 ? arr : [...arr.slice(n), ...arr.slice(0, n)]
}

/**
 * Pick a real word demonstrating one affected glyph and diff its shaping for the
 * highlight. `attempt > 0` rotates the word pool so "↻ another word" surfaces a
 * different word. Degrades to the bare glyph when no word contains it, and to no
 * highlight when the shaper is unavailable.
 */
const SPOTLIGHT_TRIES = 6
const SINGLE_CAND_SCAN = 40000

/**
 * Candidate demo words for a single char, sampling ALL positions — char at the
 * word start, end, and middle — interleaved so each position type appears early.
 * Contextual alternates are positional but in different ways (Circe's ssXX styles
 * the word-initial letter; a final-form feature triggers word-finally; others
 * mid-word), so we don't assume which — buildSpotlight's shaping check keeps the
 * first candidate that genuinely changes. Words are case-fitted to the char.
 */
function singleCandidates(char: string, pool: string[], max = 12): string[] {
  const lc = char.toLowerCase()
  const upper = char !== lc && char === char.toUpperCase()
  const fit = (w: string) => (upper ? w.toUpperCase() : w)
  const starts: string[] = []
  const ends: string[] = []
  const mids: string[] = []
  const limit = Math.min(pool.length, SINGLE_CAND_SCAN)
  for (let i = 0; i < limit && starts.length + ends.length + mids.length < max * 3; i++) {
    const w = pool[i]
    if (w.length < 4 || w.length > 14) continue
    const idx = w.toLowerCase().indexOf(lc)
    if (idx < 0) continue
    const bucket = idx === 0 ? starts : idx + lc.length === w.length ? ends : mids
    bucket.push(fit(w))
  }
  // Interleave start / end / middle so the shaping check sees every position type
  // within its first few tries, whichever one the feature actually triggers on.
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < max; i++) {
    for (const bucket of [starts, ends, mids]) {
      const w = bucket[i]
      if (w && !seen.has(w)) {
        seen.add(w)
        out.push(w)
      }
    }
  }
  return out.slice(0, max)
}

export async function buildSpotlight(
  item: string,
  opts: { isLigature?: boolean; proof: SpotlightProof; shaper?: Shaper; attempt?: number },
): Promise<Spotlight> {
  const { isLigature = false, proof, shaper, attempt = 0 } = opts
  const bank = await getBank()
  const script = classifyScript(item[0] ?? '')
  const basePool = (script && bank[script]) || []
  // A multi-codepoint item is a sequence (ligature / cascade-restyled ligature),
  // so it must appear whole in the word — use the ligature matcher, not per-char.
  const lig = isLigature || [...item].length > 1
  const hbScript = script ? HB_SCRIPT[script] : undefined

  const cands = lig ? null : singleCandidates(item, basePool)
  const pickWord = (a: number): SampleResult => {
    if (lig) {
      const rotated = rotate(basePool, a * 7)
      return pickLigatureSample([item], rotated, { maxWords: 1, maxBare: 1 })
    }
    if (!cands || cands.length === 0) return { text: item, usedCoverage: true }
    return { text: cands[a % cands.length], usedCoverage: false }
  }

  const variants =
    proof.kind === 'feature'
      ? ([{ features: cssToHbFeatures(proof.before) }, { features: cssToHbFeatures(proof.after) }] as const)
      : ([{ language: 'en' }, { language: proof.bcp47 ?? 'en' }] as const)
  const canDiff = !!shaper && !(proof.kind === 'locl' && !proof.bcp47)
  const rangesFor = (text: string): [number, number][] | undefined => {
    if (!canDiff || !text) return undefined
    try {
      const r = changedRanges(shaper!, text, variants[0], variants[1], hbScript)
      return r.length > 0 ? r : undefined
    } catch {
      return undefined
    }
  }

  // Try a few words and prefer one where the substitution ACTUALLY happens (the
  // shaping diff is non-empty). Contextual features (e.g. Circe's word-initial
  // ssXX) don't fire on every position, so the first word may show no change.
  const tries = canDiff ? SPOTLIGHT_TRIES : 1
  let fallback: Spotlight | null = null
  for (let k = 0; k < tries; k++) {
    const r = pickWord(attempt * tries + k)
    if (!r.text) continue
    const ranges = rangesFor(r.text)
    if (!fallback) fallback = { text: r.text, highlightRanges: ranges, usedCoverage: r.usedCoverage }
    if (r.usedCoverage) break // bare glyph — no real word exists, stop trying
    if (ranges) return { text: r.text, highlightRanges: ranges, usedCoverage: false }
  }
  return fallback ?? { text: item, usedCoverage: true }
}
