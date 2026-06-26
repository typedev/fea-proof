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
