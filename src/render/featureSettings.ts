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
  const before = LIGATURE_FEATURES.map((t) => `"${t}" 0`).join(', ')
  const after = LIGATURE_FEATURES.map((t) => `"${t}" ${t === tag ? 1 : 0}`).join(', ')
  return { before, after }
}
