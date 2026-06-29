import type { Shaper } from './shape'
import type { FeatureToggle } from './combinations'
import { buildHbFeatures } from './interactions'

export interface MatrixForm {
  /** Output glyph ids for this form (a run, usually one glyph). */
  gids: number[]
  /** Minimal feature combination that produces it (fewest features). */
  combo: FeatureToggle[]
  /** How many enumerated subsets reach this same form. */
  comboCount: number
}

export interface FormMatrix {
  /** Output gids with NO relevant feature on — the plain glyph. */
  baseline: number[]
  /** Every DISTINCT non-baseline form reachable by a combination of the features. */
  forms: MatrixForm[]
  /** True when the relevant feature set was hard-capped (pathologically large). */
  truncated: boolean
}

const sumOrder = (combo: FeatureToggle[]): number => combo.reduce((n, f) => n + f.order, 0)

/** Yield every index combination of [0,k) of exactly `size` elements (lexicographic). */
function* combosOfSize(k: number, size: number): Generator<number[]> {
  const idx = new Array<number>(size)
  function* rec(start: number, depth: number): Generator<number[]> {
    if (depth === size) {
      yield idx
      return
    }
    for (let i = start; i <= k - (size - depth); i++) {
      idx[depth] = i
      yield* rec(i + 1, depth + 1)
    }
  }
  if (size <= k) yield* rec(0, 0)
}

/**
 * For a base glyph, find every DISTINCT output form reachable by a combination of
 * the features affecting it, each labelled with the MINIMAL combination producing
 * it. The shaper applies a feature SET in the font's LookupList order, so each set
 * has one deterministic result and only SUBSETS (not orderings) need enumerating.
 *
 * Enumerated by growing combination size, stopping as soon as a size adds NO new
 * form: for an isolated glyph a feature that's a no-op alone stays a no-op in any
 * combination, and cascades build up incrementally — so once forms saturate, deeper
 * combinations are redundant. This finds all real forms without the 2^k powerset.
 * (`maxLevel`/`hardCap` only bound pathological cases.)
 */
export function buildFormMatrix(
  shaper: Shaper,
  frag: string,
  features: FeatureToggle[],
  maxLevel = 6,
  hardCap = 24,
): FormMatrix {
  const used = [...features].sort((a, b) => a.order - b.order).slice(0, hardCap)
  const truncated = features.length > used.length
  const k = used.length

  const shapeSig = (active: Set<string>): { key: string; gids: number[] } => {
    const gids = shaper.shape(frag, { features: buildHbFeatures(used, active) }).map((g) => g.g)
    return { key: gids.join(','), gids }
  }

  const baseline = shapeSig(new Set())
  const forms = new Map<string, { gids: number[]; combo: FeatureToggle[]; count: number }>()

  // For a multi-glyph fragment the meaningful form is a LIGATURE — the glyph count
  // changes (components combine, or one decomposes). Same-length forms are just
  // per-component swaps (one letter restyled); shown on that feature's own card, and
  // they explode combinatorially here. A single glyph has no such notion — any
  // change counts.
  const isCoherent = (gids: number[]): boolean =>
    baseline.gids.length <= 1 || gids.length !== baseline.gids.length

  for (let level = 1; level <= Math.min(maxLevel, k); level++) {
    let added = 0
    for (const sub of combosOfSize(k, level)) {
      const active = new Set<string>()
      const combo: FeatureToggle[] = []
      for (const i of sub) {
        active.add(used[i].tag)
        combo.push(used[i])
      }
      let s: { key: string; gids: number[] }
      try {
        s = shapeSig(active)
      } catch {
        continue
      }
      if (s.key === baseline.key || !isCoherent(s.gids)) continue
      const existing = forms.get(s.key)
      if (!existing) {
        forms.set(s.key, { gids: s.gids, combo: combo.slice(), count: 1 })
        added++
      } else {
        existing.count++
        // First seen at the minimal size already; only refine tie-break within a size.
        if (combo.length === existing.combo.length && sumOrder(combo) < sumOrder(existing.combo)) {
          existing.combo = combo.slice()
        }
      }
    }
    // Once a whole size adds nothing new, deeper sizes can't either (no-op-alone
    // features stay no-op; cascades already grew incrementally).
    if (level >= 2 && added === 0) break
  }

  const list: MatrixForm[] = [...forms.values()]
    .map((f) => ({ gids: f.gids, combo: f.combo, comboCount: f.count }))
    .sort((a, b) => a.combo.length - b.combo.length || sumOrder(a.combo) - sumOrder(b.combo))

  return { baseline: baseline.gids, forms: list, truncated }
}
