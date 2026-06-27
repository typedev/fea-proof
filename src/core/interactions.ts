import type { Shaper } from './shape'

export interface ToggleFeature {
  tag: string
  defaultOn: boolean
}

/** HarfBuzz feature list for an active toggle set, mirroring the CSS rendering. */
export function buildHbFeatures(features: ToggleFeature[], active: Set<string>): string[] {
  const out: string[] = []
  for (const f of features) {
    if (active.has(f.tag)) out.push(`${f.tag}=1`)
    else if (f.defaultOn) out.push(`${f.tag}=0`)
  }
  return out
}

function signature(shaper: Shaper, text: string, features: string[]): string {
  // Include advances so spacing-only features (tnum/pnum) register as effective.
  return shaper.shape(text, { features }).map((g) => `${g.g}:${g.ax}`).join(',')
}

/**
 * Which of the group's features actually change the shaping in the CURRENT active
 * state — i.e. toggling the feature changes the rendered glyphs. Reveals live
 * dependencies (a feature does nothing until its prerequisite is on) and conflicts
 * (a feature overridden by another applied later in LookupList order).
 */
export function effectiveFeatures(
  shaper: Shaper,
  text: string,
  features: ToggleFeature[],
  active: Set<string>,
): Set<string> {
  const current = signature(shaper, text, buildHbFeatures(features, active))
  const effective = new Set<string>()
  for (const f of features) {
    const toggled = new Set(active)
    if (toggled.has(f.tag)) toggled.delete(f.tag)
    else toggled.add(f.tag)
    if (signature(shaper, text, buildHbFeatures(features, toggled)) !== current) effective.add(f.tag)
  }
  return effective
}
