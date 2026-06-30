import type { Font } from 'opentype.js'

/**
 * Render a glyph by its id straight from the font outline (not as text). Needed
 * for glyphs that have no Unicode mapping — e.g. variant glyphs produced by
 * rvrn (`a.italic`, `l.sans`) or the unreachable-glyph inventory.
 *
 * `fit` sizes the SVG to the glyph's bounding box instead of its advance width —
 * essential for combining marks, which have ~0 advance and sit offset/high, so
 * advance-based sizing would clip them.
 */
export function GlyphOutline({
  font,
  gid,
  size = 26,
  fit = false,
  className,
}: {
  font: Font
  gid: number
  size?: number
  fit?: boolean
  className?: string
}) {
  const glyph = font.glyphs.get(gid)
  const upm = font.unitsPerEm || 1000
  const nameFallback = (
    <span style={{ height: size * 1.5 }} className="flex items-center text-[10px] text-neutral-400 dark:text-neutral-600">
      {glyph?.name ?? '·'}
    </span>
  )

  if (fit) {
    // Path in font units (opentype.js getPath flips Y: screen y = -fontY).
    let bb: { x1: number; y1: number; x2: number; y2: number } | undefined
    let d = ''
    try {
      bb = glyph?.getBoundingBox()
      d = glyph?.getPath(0, 0, upm).toPathData(2) ?? ''
    } catch {
      d = ''
    }
    const w = bb ? bb.x2 - bb.x1 : 0
    const h = bb ? bb.y2 - bb.y1 : 0
    if (!d || d.includes('NaN') || !(w > 0) || !(h > 0)) return nameFallback
    // Em-proportional: the glyph keeps its true scale (size px = 1 em), and the
    // SVG box is just the glyph's bounding box — so a small mark stays small and
    // a cap-height letter stays tall, instead of every glyph being blown up to
    // fill the cell. The viewBox is panned to the glyph (marks sit high/offset).
    const scale = size / upm
    const pad = upm * 0.06
    const vbW = w + pad * 2
    const vbH = h + pad * 2
    const viewBox = `${bb!.x1 - pad} ${-bb!.y2 - pad} ${vbW} ${vbH}`
    return (
      <svg
        viewBox={viewBox}
        width={vbW * scale}
        height={vbH * scale}
        className={`overflow-visible ${className ?? ''}`}
      >
        <path d={d} className="fill-current" />
      </svg>
    )
  }

  // Non-fit: position the glyph as a browser lays out text at `font-size: size;
  // line-height: 1.5` — baseline from the font's own ascender/descender via the
  // standard half-leading split, and the SVG IS that line box. So an outline glyph
  // drops into a cell at the same size AND baseline as a text glyph, matching the
  // single-feature cards (AffectedGlyphs). (`fit` mode above stays bbox-tight for
  // marks/variants that have ~0 advance.)
  const ascPx = ((font.ascender || upm * 0.8) / upm) * size
  const descPx = (-(font.descender || -upm * 0.2) / upm) * size // positive
  const lineBox = size * 1.5
  const baseline = (lineBox - (ascPx + descPx)) / 2 + ascPx
  const adv = ((glyph?.advanceWidth ?? upm) / upm) * size
  let d = ''
  try {
    d = glyph?.getPath(0, baseline, size).toPathData(2) ?? ''
  } catch {
    d = ''
  }
  if (d.includes('NaN')) d = ''
  if (!d) return nameFallback
  return (
    <svg width={Math.max(adv, size * 0.4)} height={lineBox} className={`overflow-visible ${className ?? ''}`}>
      <path d={d} className="fill-current" />
    </svg>
  )
}
