// Inline real-word demos for affected-glyph tiles: each tile shows
// glyph1 → glyph2 plus a word that exercises the substitution (rendered with the
// feature applied, the changed glyph highlighted), or just the pair when no word
// applies. The word bank is font-INDEPENDENT (language word pools) so it's cached
// globally and loaded when a grid expands.
//
// Single chars are SHAPE-VERIFIED: contextual alternates are positional (some
// stylistic sets style the word-initial letter, others the word-final one) and
// can't be told apart by string position, so we shape each candidate and keep the
// first where the substitution actually fires. Multi-codepoint items are
// sequences (ligatures / cascade-restyled ligatures) — they always contain the
// sequence, so no shaping is needed.

import { changedRanges, type Shaper } from '../core/shape'
import { classifyScript, findLigatureWord } from './pick'
import { loadWordBank, type Script } from './languages'

const HB_SCRIPT: Record<Script, string> = { latn: 'Latn', cyrl: 'Cyrl', grek: 'Grek' }

let bankPromise: Promise<Record<string, string[]>> | null = null
function getBank(): Promise<Record<string, string[]>> {
  return (bankPromise ??= loadWordBank(['latn', 'cyrl', 'grek']))
}

/** CSS `font-feature-settings` ("ss01" 1) → HarfBuzz feature strings (ss01=1). */
export function cssToHbFeatures(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/"([A-Za-z0-9]{1,4})"\s+(\d+)/g)) out.push(`${m[1]}=${m[2]}`)
  return out
}

/** How to diff the before vs after sides when shape-verifying a demo word. */
export type SpotlightProof =
  | { kind: 'feature'; before: string; after: string } // CSS font-feature-settings
  | { kind: 'locl'; bcp47?: string } // localized via font-language-override

const SINGLE_CAND_SCAN = 40000

/**
 * Candidate demo words for a single char, sampling ALL positions — char at the
 * word start, end, and middle — interleaved so each position type appears early.
 * Contextual alternates are positional but in different ways (some stylistic sets
 * style only the word-initial letter; a final-form feature triggers word-finally),
 * so we try them in turn and let the shaping check pick the one that fires. Words
 * are case-fitted to the char.
 */
function singleCandidates(char: string, pool: string[], max = 9): string[] {
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

export interface InlineSample {
  /** The demo word, case-fitted to the glyph. */
  text: string
  /** Ranges to highlight (real shaping diff for singles, string position else). */
  ranges?: [number, number][]
}

/**
 * Pick a demo word for each affected item. Singles are shape-verified against
 * `proof` (the feature toggle or locl language) so positional alternates surface
 * a word where they actually fire; sequences use the ligature matcher. Returns
 * null for an item no word applies to (the tile shows just the pair).
 */
export async function inlineSamples(
  items: string[],
  isLigature: boolean,
  proof?: SpotlightProof,
  shaper?: Shaper,
): Promise<Map<string, InlineSample | null>> {
  const bank = await getBank()
  const map = new Map<string, InlineSample | null>()

  const variants =
    proof?.kind === 'feature'
      ? ([{ features: cssToHbFeatures(proof.before) }, { features: cssToHbFeatures(proof.after) }] as const)
      : proof?.kind === 'locl'
        ? ([{ language: 'en' }, { language: proof.bcp47 ?? 'en' }] as const)
        : null
  const canDiff = !!shaper && !!variants && !(proof?.kind === 'locl' && !proof.bcp47)

  for (const item of items) {
    if (map.has(item)) continue
    const script = classifyScript(item[0] ?? '')
    const pool = (script && bank[script]) || []
    if (pool.length === 0) {
      map.set(item, null)
      continue
    }
    const stringRange = (word: string): [number, number][] | undefined => {
      const idx = word.toLowerCase().indexOf(item.toLowerCase())
      return idx >= 0 ? [[idx, idx + item.length]] : undefined
    }

    // A multi-codepoint item is a sequence — it always contains the whole thing,
    // so no positional ambiguity and no shaping needed.
    if (isLigature || [...item].length > 1) {
      const word = findLigatureWord(item, pool)
      map.set(item, word ? { text: word, ranges: stringRange(word) } : null)
      continue
    }

    const cands = singleCandidates(item, pool)
    if (cands.length === 0) {
      map.set(item, null)
      continue
    }
    if (canDiff && variants) {
      const hbScript = script ? HB_SCRIPT[script] : undefined
      const lcItem = item.toLowerCase()
      const positions = (word: string): number[] => {
        const wl = word.toLowerCase()
        const out: number[] = []
        for (let i = wl.indexOf(lcItem); i >= 0; i = wl.indexOf(lcItem, i + 1)) out.push(i)
        return out
      }
      // Try the word standalone AND space-padded: features differ on what counts
      // as a word boundary — an initial form fires at the string start (no space),
      // a swash-final form needs an actual space after the letter. We render
      // whichever context actually triggers, so the cell matches the highlight.
      const contexts = [(w: string) => w, (w: string) => ` ${w} `]
      let picked: InlineSample | null = null
      outer: for (const word of cands) {
        for (const wrap of contexts) {
          const text = wrap(word)
          const off = text.indexOf(word)
          try {
            const r = changedRanges(shaper!, text, variants[0], variants[1], hbScript)
            if (r.length === 0) continue
            // Keep it only if THIS glyph changed (not some other letter the
            // feature also touches, e.g. a word-final letter under a final form).
            const hit = positions(word)
              .map((p) => p + off)
              .filter((p) => r.some(([s, e]) => p >= s && p < e))
            if (hit.length > 0) {
              picked = { text, ranges: hit.map((p) => [p, p + item.length]) }
              break outer
            }
          } catch {
            // shaping failed for this context — try the next
          }
        }
      }
      // With a shaper we KNOW whether this glyph changes in context. If no
      // candidate shows it (a positional form with no word that places the glyph
      // in its triggering slot, e.g. a final form of a letter words rarely end
      // with), show just the pair — the isolated pair still demonstrates the form
      // — rather than a word with a misleading highlight.
      map.set(item, picked)
      continue
    }
    // No shaper: best-effort string-position highlight.
    map.set(item, { text: cands[0], ranges: stringRange(cands[0]) })
  }
  return map
}
