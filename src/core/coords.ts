import type { Font } from 'opentype.js'
import type { VariationAxis } from './variations'

// Convert NORMALIZED axis coordinates (−1…1, as stored in GSUB FeatureVariations
// conditions) back to user-space design values, so ranges read as "wght 600…1000"
// instead of "0.43…1". Normalization is: user → linear-normalize (via fvar
// min/default/max) → avar segment remap. We invert both: avar-inverse, then
// linear denormalize. Anchors (−1→min, 0→default, +1→max) are always exact;
// identity-avar axes are exact everywhere.

/** Per-axis avar segments (pre-avar `from` → post-avar `to`), sorted by `to`. */
export type AvarSegments = Record<string, { from: number; to: number }[]>

interface OtAvar {
  axisSegmentMaps?: { axisValueMaps?: { fromCoordinate: number; toCoordinate: number }[] }[]
}

/** Read avar v1 segment maps, keyed by axis tag (axes are in fvar order). */
export function readAvarSegments(font: Font, axes: VariationAxis[]): AvarSegments {
  const maps = ((font.tables as Record<string, OtAvar | undefined>).avar)?.axisSegmentMaps
  const out: AvarSegments = {}
  if (!Array.isArray(maps)) return out
  axes.forEach((axis, i) => {
    const pts = maps[i]?.axisValueMaps
    if (Array.isArray(pts) && pts.length >= 2) {
      out[axis.tag] = pts
        .map((p) => ({ from: p.fromCoordinate, to: p.toCoordinate }))
        .sort((a, b) => a.to - b.to)
    }
  })
  return out
}

/** Invert an avar segment map: post-avar normalized `c` → pre-avar normalized. */
function avarInverse(segments: { from: number; to: number }[] | undefined, c: number): number {
  if (!segments || segments.length < 2) return c
  if (c <= segments[0].to) return segments[0].from
  for (let i = 1; i < segments.length; i++) {
    const lo = segments[i - 1]
    const hi = segments[i]
    if (c <= hi.to) {
      return hi.to === lo.to ? lo.from : lo.from + ((c - lo.to) * (hi.from - lo.from)) / (hi.to - lo.to)
    }
  }
  return segments[segments.length - 1].from
}

/** Linear denormalize a (pre-avar) normalized value via fvar min/default/max. */
function denormalize(axis: VariationAxis, n: number): number {
  if (n <= -1) return axis.min
  if (n >= 1) return axis.max
  if (n < 0) return axis.default + n * (axis.default - axis.min)
  if (n > 0) return axis.default + n * (axis.max - axis.default)
  return axis.default
}

/** Normalized axis coordinate → user-space design value. */
export function toUserCoord(axis: VariationAxis, segments: AvarSegments, normalized: number): number {
  return denormalize(axis, avarInverse(segments[axis.tag], normalized))
}

/** Linear-normalize a user value to [−1,1] via fvar min/default/max (pre-avar). */
function linearNormalize(axis: VariationAxis, user: number): number {
  const v = Math.max(axis.min, Math.min(axis.max, user))
  if (v === axis.default) return 0
  if (v < axis.default) return axis.default === axis.min ? 0 : -(axis.default - v) / (axis.default - axis.min)
  return axis.max === axis.default ? 0 : (v - axis.default) / (axis.max - axis.default)
}

/** Apply an avar segment map FORWARD: pre-avar normalized → post-avar normalized. */
function avarForward(segments: { from: number; to: number }[] | undefined, c: number): number {
  if (!segments || segments.length < 2) return c
  const segs = [...segments].sort((a, b) => a.from - b.from) // readAvarSegments sorts by `to`
  if (c <= segs[0].from) return segs[0].to
  for (let i = 1; i < segs.length; i++) {
    const lo = segs[i - 1]
    const hi = segs[i]
    if (c <= hi.from) {
      return hi.from === lo.from ? lo.to : lo.to + ((c - lo.from) * (hi.to - lo.to)) / (hi.from - lo.from)
    }
  }
  return segs[segs.length - 1].to
}

/**
 * User-space coords → normalized [−1,1], in fvar axis order (the order an
 * ItemVariationStore's regions index by). fvar-linear then avar-forward.
 */
export function normalizeCoords(
  coords: Record<string, number>,
  axes: VariationAxis[],
  avarSegments: AvarSegments,
): number[] {
  return axes.map((axis) =>
    avarForward(avarSegments[axis.tag], linearNormalize(axis, coords[axis.tag] ?? axis.default)),
  )
}

/**
 * A user-space value that lands INSIDE a condition's normalized range. Anchors
 * are exact regardless of avar (min→−1, default→0, max→+1); prefer the default
 * when it's in range (least disruptive), else an axis extreme, else the (avar-
 * unaware, best-effort) midpoint of the range.
 */
function inRangeValue(axis: VariationAxis, min: number, max: number): number {
  if (min <= 0 && 0 <= max) return axis.default
  if (max >= 1) return axis.max
  if (min <= -1) return axis.min
  return denormalize(axis, (min + max) / 2)
}

/**
 * User-space coordinates that satisfy every axis range in a condition set, built
 * on top of a base (typically the default instance). Axes not named by the
 * condition keep their base value. Used by the rvrn "apply coordinates" action.
 */
export function inConditionCoords(
  axes: VariationAxis[],
  conditions: { tag: string; min: number; max: number }[],
  base: Record<string, number>,
): Record<string, number> {
  const byTag = new Map(axes.map((a) => [a.tag, a]))
  const coords = { ...base }
  for (const c of conditions) {
    const axis = byTag.get(c.tag)
    if (axis) coords[c.tag] = inRangeValue(axis, c.min, c.max)
  }
  return coords
}
