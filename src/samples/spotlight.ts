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
import { classifyScript, pickSample, pickLigatureSample, findLigatureWord } from './pick'
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
    if (isLigature) {
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
export async function buildSpotlight(
  item: string,
  opts: { isLigature?: boolean; proof: SpotlightProof; shaper?: Shaper; attempt?: number },
): Promise<Spotlight> {
  const { isLigature = false, proof, shaper, attempt = 0 } = opts
  const bank = await getBank()
  const script = classifyScript(item[0] ?? '')
  const pool = (script && bank[script]) || []
  const rotated = rotate(pool, attempt * 7)

  let text: string
  let usedCoverage: boolean
  if (isLigature) {
    const r = pickLigatureSample([item], rotated, { maxWords: 1, maxBare: 1, offset: 0 })
    text = r.text
    usedCoverage = r.usedCoverage
  } else {
    const localBank = script ? { [script]: rotated } : {}
    // minLen 4 so the demo word isn't a 2–3 letter function word.
    const r = pickSample([item], localBank, { minWords: 1, maxWords: 2, maxChars: 28, minLen: 4 })
    text = r.text
    usedCoverage = r.usedCoverage
  }

  let highlightRanges: [number, number][] | undefined
  if (shaper && text) {
    try {
      const hbScript = script ? HB_SCRIPT[script] : undefined
      const [before, after] =
        proof.kind === 'feature'
          ? [{ features: cssToHbFeatures(proof.before) }, { features: cssToHbFeatures(proof.after) }]
          : [{ language: 'en' }, { language: proof.bcp47 ?? 'en' }]
      const ranges =
        proof.kind === 'locl' && !proof.bcp47
          ? [] // can't diff without a BCP-47 language
          : changedRanges(shaper, text, before, after, hbScript)
      if (ranges.length > 0) highlightRanges = ranges
    } catch {
      // shaping failed — show the word without highlight
    }
  }

  return { text, highlightRanges, usedCoverage }
}
