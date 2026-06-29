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
