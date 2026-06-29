import type { Shaper } from './shape'
import type { FeatureToggle } from './combinations'
import { buildHbFeatures } from './interactions'

export interface MatrixForm {
  /** Output glyph ids for this form (a run, usually one glyph). */
  gids: number[]
  /** Minimal feature combination that produces it (fewest features). */
  combo: FeatureToggle[]
  /** How many distinct feature subsets reach this same form. */
  comboCount: number
}

export interface FormMatrix {
  /** Output gids with NO relevant feature on — the plain glyph. */
  baseline: number[]
  /** Every DISTINCT non-baseline form reachable by some feature subset. */
  forms: MatrixForm[]
  /** True when the relevant feature set was capped (2^n blown past the budget). */
  truncated: boolean
}

const sumOrder = (combo: FeatureToggle[]): number => combo.reduce((n, f) => n + f.order, 0)

/**
 * Enumerate the powerset of `features` over a base fragment, shape each subset, and
 * bucket the distinct OUTPUT forms (by output-gid sequence). Each distinct
 * non-baseline form is labelled with the MINIMAL subset that produces it (fewest
 * features, tie-break by lowest summed lookup order); subsets that don't change the
 * glyph collapse into the baseline and are dropped. Caps work at 2^maxFeatures (the
 * relevant set is normally 2–5); `truncated` flags when features were dropped.
 *
 * Mirrors the inline explorer's baseline semantics (all relevant features OFF =
 * plain glyph) and uses the same `buildHbFeatures` toggle strings.
 */
export function buildFormMatrix(
  shaper: Shaper,
  frag: string,
  features: FeatureToggle[],
  maxFeatures = 12,
): FormMatrix {
  const sorted = [...features].sort((a, b) => a.order - b.order)
  const used = sorted.slice(0, maxFeatures)
  const truncated = sorted.length > used.length
  const k = used.length

  const shapeSig = (active: Set<string>): { key: string; gids: number[] } => {
    const gids = shaper.shape(frag, { features: buildHbFeatures(used, active) }).map((g) => g.g)
    return { key: gids.join(','), gids }
  }

  const baseline = shapeSig(new Set())
  const forms = new Map<string, { gids: number[]; combo: FeatureToggle[]; count: number }>()

  for (let mask = 1; mask < 1 << k; mask++) {
    const active = new Set<string>()
    const combo: FeatureToggle[] = []
    for (let i = 0; i < k; i++) {
      if (mask & (1 << i)) {
        active.add(used[i].tag)
        combo.push(used[i])
      }
    }
    let s: { key: string; gids: number[] }
    try {
      s = shapeSig(active)
    } catch {
      continue
    }
    if (s.key === baseline.key) continue
    const existing = forms.get(s.key)
    if (!existing) {
      forms.set(s.key, { gids: s.gids, combo, count: 1 })
    } else {
      existing.count++
      if (
        combo.length < existing.combo.length ||
        (combo.length === existing.combo.length && sumOrder(combo) < sumOrder(existing.combo))
      ) {
        existing.combo = combo
      }
    }
  }

  const list: MatrixForm[] = [...forms.values()]
    .map((f) => ({ gids: f.gids, combo: f.combo, comboCount: f.count }))
    .sort((a, b) => a.combo.length - b.combo.length || sumOrder(a.combo) - sumOrder(b.combo))

  return { baseline: baseline.gids, forms: list, truncated }
}
