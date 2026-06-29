/**
 * CSS `font-feature-settings` values for a before/after proof.
 *
 * - default-OFF feature: before = baseline (nothing set), after = feature on.
 * - default-ON feature: before = feature explicitly off, after = feature on.
 *
 * Only the target feature is toggled, so other default features keep their state.
 */
export function beforeAfterSettings(tag: string, defaultOn: boolean): { before: string; after: string } {
  if (defaultOn) return { before: `"${tag}" 0`, after: `"${tag}" 1` }
  return { before: 'normal', after: `"${tag}" 1` }
}

const LIGATURE_FEATURES = ['liga', 'clig', 'dlig', 'hlig', 'rlig']

/**
 * Isolated before/after for a ligature feature: standard ligatures (liga/clig)
 * are default-on, so they'd ligate on BOTH sides and hide the difference. So we
 * turn ALL ligature features off for "before" (components shown separately) and
 * enable ONLY the target for "after" — showing exactly what that feature does.
 */
export function ligatureBeforeAfter(tag: string): { before: string; after: string } {
  // Include the target itself (some ligature features like ordn aren't in the
  // standard list) so "after" actually enables it.
  const group = [...new Set([...LIGATURE_FEATURES, tag])]
  const before = group.map((t) => `"${t}" 0`).join(', ')
  const after = group.map((t) => `"${t}" ${t === tag ? 1 : 0}`).join(', ')
  return { before, after }
}

// Figure-style features interact (figure style / width / position / fractions),
// and `aalt`/`salt` re-substitute digits too. Like ligatures, several can apply
// at once and pollute a proof — so isolate the target: turn the whole group OFF
// for "before" (the font's nominal figures) and enable ONLY the target for
// "after". This keeps "default" honest and avoids a sibling (or aalt) leaking in.
const FIGURE_FEATURES = [
  'lnum', 'onum', 'tnum', 'pnum', 'dnom', 'numr', 'sinf', 'subs', 'sups',
  'ordn', 'ords', 'zero', 'frac', 'afrc', 'expt', 'aalt', 'salt',
]

/**
 * Numeric / figure-position features (digits, fractions, super/subscripts,
 * ordinals). Their glyphs are digits or figure-style letters, so the per-glyph
 * real-word spotlight doesn't apply — they're proofed on numeric templates.
 */
export function isFigureLikeFeature(tag: string): boolean {
  return FIGURE_FEATURES.includes(tag)
}

// Case / small-caps features change every letter uniformly (a whole-alphabet
// case shift), so an inline demo word adds nothing over the glyph1 → glyph2 pair.
const CASE_FEATURES = ['smcp', 'c2sc', 'pcap', 'c2pc', 'unic', 'cpsp']

export function isCaseFeature(tag: string): boolean {
  return CASE_FEATURES.includes(tag)
}

// Positional features substitute a glyph for the form used in a given word
// position. The demo word must place the glyph there (and we highlight just that
// position) — otherwise, since these are usually plain single-subs that apply to
// the whole run when forced on, a "final form" would show up word-initially.
export type PositionRole = 'start' | 'end' | 'mid' | 'isolated'
const POSITIONAL: Record<string, PositionRole> = {
  init: 'start',
  fina: 'end',
  medi: 'mid',
  isol: 'isolated',
}

export function positionalRole(tag: string): PositionRole | undefined {
  return POSITIONAL[tag]
}

export function figureBeforeAfter(tag: string): { before: string; after: string } {
  const group = [...new Set([...FIGURE_FEATURES, tag])]
  const before = group.map((t) => `"${t}" 0`).join(', ')
  const after = group.map((t) => `"${t}" ${t === tag ? 1 : 0}`).join(', ')
  return { before, after }
}

// HarfBuzz feature-string variants (for shaping diff, see core/shape.ts), mirroring
// the CSS before/after above. HarfBuzz uses "tag=1" / "tag=0".

export function beforeAfterFeatures(tag: string, defaultOn: boolean): { before: string[]; after: string[] } {
  if (defaultOn) return { before: [`${tag}=0`], after: [`${tag}=1`] }
  return { before: [], after: [`${tag}=1`] }
}

export function figureFeatures(tag: string): { before: string[]; after: string[] } {
  const group = [...new Set([...FIGURE_FEATURES, tag])]
  return {
    before: group.map((t) => `${t}=0`),
    after: group.map((t) => `${t}=${t === tag ? 1 : 0}`),
  }
}

export function ligatureFeatures(tag: string): { before: string[]; after: string[] } {
  const group = [...new Set([...LIGATURE_FEATURES, tag])]
  return {
    before: group.map((t) => `${t}=0`),
    after: group.map((t) => `${t}=${t === tag ? 1 : 0}`),
  }
}

/**
 * CSS `font-variation-settings` from a coordinate map. Includes ALL axes (hidden
 * ones too — they have no slider but must still render at their held value).
 * Empty map → 'normal'.
 */
export function toVariationSettings(coords: Record<string, number>): string {
  const parts = Object.entries(coords).map(([tag, v]) => `"${tag}" ${v}`)
  return parts.length ? parts.join(', ') : 'normal'
}
