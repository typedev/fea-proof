// Inline real-word demos for affected-glyph tiles: each tile shows
// glyph1 → glyph2 plus a word that exercises the substitution (rendered with the
// feature applied), or just the pair when no word contains the glyph. The word
// bank is font-INDEPENDENT (language word pools) so it's cached globally and
// loaded lazily when a grid expands. No shaping here — the glyph1 → glyph2 pair
// already shows the change; the word's highlight is the item's position found by
// string search.

import { classifyScript, findLigatureWord } from './pick'
import { loadWordBank } from './languages'

let bankPromise: Promise<Record<string, string[]>> | null = null
function getBank(): Promise<Record<string, string[]>> {
  return (bankPromise ??= loadWordBank(['latn', 'cyrl', 'grek']))
}

const SINGLE_CAND_SCAN = 40000

/**
 * Candidate demo words for a single char, sampling ALL positions — char at the
 * word start, end, and middle — interleaved so each position type appears early.
 * Contextual alternates are positional but in different ways (some stylistic sets
 * style only the word-initial letter; a final-form feature triggers word-finally),
 * so the word-initial candidate (first) is the most likely to actually show the
 * change, while later ones cover the other cases. Words are case-fitted to the char.
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
  /** Where the glyph sits in the word, for highlighting. */
  range?: [number, number]
}

/**
 * Pick a demo word for each affected item. A multi-codepoint item is a sequence
 * (ligature / cascade-restyled ligature, e.g. an "AA" pair), matched whole via
 * the case-insensitive ligature matcher; a single char uses word-position
 * sampling. Returns null for an item no word contains (tile shows just the pair).
 */
export async function inlineSamples(
  items: string[],
  isLigature: boolean,
): Promise<Map<string, InlineSample | null>> {
  const bank = await getBank()
  const map = new Map<string, InlineSample | null>()
  for (const item of items) {
    if (map.has(item)) continue
    const script = classifyScript(item[0] ?? '')
    const pool = (script && bank[script]) || []
    const lig = isLigature || [...item].length > 1
    const word = pool.length
      ? lig
        ? findLigatureWord(item, pool)
        : singleCandidates(item, pool)[0] ?? null
      : null
    if (!word) {
      map.set(item, null)
      continue
    }
    const idx = word.toLowerCase().indexOf(item.toLowerCase())
    map.set(item, { text: word, range: idx >= 0 ? [idx, idx + item.length] : undefined })
  }
  return map
}
