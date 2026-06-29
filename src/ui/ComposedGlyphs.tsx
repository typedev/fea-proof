import type { Font } from 'opentype.js'
import type { Anchor, Placed } from '../core/markAnchors'

/**
 * Render a base glyph + attached marks as outlines in ONE shared coordinate space
 * (font units), positioned by GPOS anchors (see core/markAnchors `placeMarks`).
 * opentype.js flips Y (screen y = −fontY), so each glyph's default-master path is
 * drawn at em scale and translated by its (x, −y). Optionally overlays the anchor
 * points used for attachment.
 */
export function ComposedGlyphs({
  font,
  placed,
  anchorsUsed,
  showAnchors = false,
  height,
}: {
  font: Font
  placed: Placed[]
  anchorsUsed?: Anchor[]
  showAnchors?: boolean
  height: number
}) {
  const upm = font.unitsPerEm || 1000
  const paths: { d: string; x: number; y: number }[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of placed) {
    const glyph = font.glyphs.get(p.gid)
    if (!glyph) continue
    let d = ''
    try {
      d = glyph.getPath(0, 0, upm).toPathData(2)
    } catch {
      d = ''
    }
    if (!d || d.includes('NaN')) continue
    const bb = glyph.getBoundingBox()
    if (!bb || !(bb.x2 - bb.x1 >= 0) || !(bb.y2 - bb.y1 >= 0)) continue
    paths.push({ d, x: p.x, y: p.y })
    // Screen-space extents (y flipped): screenY = −(fontY).
    minX = Math.min(minX, p.x + bb.x1)
    maxX = Math.max(maxX, p.x + bb.x2)
    minY = Math.min(minY, -(p.y + bb.y2))
    maxY = Math.max(maxY, -(p.y + bb.y1))
  }

  if (paths.length === 0 || !isFinite(minX)) return null

  const pad = upm * 0.06
  const vbW = maxX - minX + pad * 2
  const vbH = maxY - minY + pad * 2
  const viewBox = `${minX - pad} ${minY - pad} ${vbW} ${vbH}`
  const dot = upm * 0.014

  return (
    <svg viewBox={viewBox} height={height} width={(vbW / vbH) * height} className="overflow-visible">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          transform={`translate(${p.x} ${-p.y})`}
          className="fill-neutral-900 dark:fill-neutral-100"
        />
      ))}
      {showAnchors &&
        anchorsUsed?.map((a, i) => (
          <circle key={i} cx={a.x} cy={-a.y} r={dot} className="fill-indigo-500" />
        ))}
    </svg>
  )
}
