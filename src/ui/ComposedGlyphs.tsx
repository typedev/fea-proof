import type { Point } from '../core/markAnchors'

/** A glyph to draw: SVG path + position + bounding box, all in FONT UNITS, Y-UP. */
export interface RenderItem {
  d: string
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Render a base glyph + attached marks as outlines in one shared coordinate space.
 * Items are y-up font units (as produced by HarfBuzz `glyphToPath` or opentype's
 * raw `glyph.path`); we flip Y here (`scale(1 −1)`) and frame a single viewBox so
 * a small mark stays small and the stack is centered. Optionally overlays anchors.
 *
 * The SVG FILLS its parent and preserves aspect ratio (`xMidYMid meet`), so the
 * stack always fits the available box — the caller sizes the box, not the glyph
 * (avoids overflow on short viewports). Give the parent a definite height.
 */
export function ComposedGlyphs({
  items,
  anchorsUsed,
  showAnchors = false,
  upm,
}: {
  items: RenderItem[]
  anchorsUsed?: Point[]
  showAnchors?: boolean
  upm: number
}) {
  const valid = items.filter((it) => it.d && !it.d.includes('NaN') && it.x2 - it.x1 >= 0 && it.y2 - it.y1 >= 0)
  if (valid.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of valid) {
    // Screen space (y flipped): screenY = −fontY, so top = −(y+y2), bottom = −(y+y1).
    minX = Math.min(minX, it.x + it.x1)
    maxX = Math.max(maxX, it.x + it.x2)
    minY = Math.min(minY, -(it.y + it.y2))
    maxY = Math.max(maxY, -(it.y + it.y1))
  }

  const pad = upm * 0.06
  const vbW = maxX - minX + pad * 2
  const vbH = maxY - minY + pad * 2
  const dot = upm * 0.014

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full max-h-full w-full"
    >

      {valid.map((it, i) => (
        <path
          key={i}
          d={it.d}
          transform={`translate(${it.x} ${-it.y}) scale(1 -1)`}
          className="fill-neutral-900 dark:fill-neutral-100"
        />
      ))}
      {showAnchors &&
        anchorsUsed?.map((a, i) => <circle key={i} cx={a.x} cy={-a.y} r={dot} className="fill-indigo-500" />)}
    </svg>
  )
}
