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
