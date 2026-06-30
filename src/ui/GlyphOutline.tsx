import { useMemo } from 'react'
import type { Font } from 'opentype.js'
import type { OutlineFont } from '../core/shape'

/**
 * Render a glyph by its id straight from the font outline (not as text). Needed
 * for glyphs that have no Unicode mapping — e.g. variant glyphs produced by
 * rvrn (`a.italic`, `l.sans`) or the unreachable-glyph inventory.
 *
 * `fit` sizes the SVG to the glyph's bounding box instead of its advance width —
 * essential for combining marks, which have ~0 advance and sit offset/high, so
 * advance-based sizing would clip them.
 *
 * When an `outline` (HarfBuzz `loadOutlineFont`) is supplied, the PATH comes from
 * HarfBuzz at the current `coords` instead of opentype.js. opentype.js can't
 * interpolate gvar (it only ever draws the default master, so axis sliders would
 * do nothing) and produces NaN path data for composite glyphs at a fractional
 * baseline `y`; HarfBuzz has neither problem. The opentype `font` is still used
 * for metrics (upem/ascender/descender/advance) and the name fallback. Sections
 * that share one `outline` must call `outline.setVariations(coords)` once before
 * rendering their tiles (React renders parent-before-child, so children read the
 * right coords); `coords` here only re-keys the memo so paths recompute on a move.
 */
export function GlyphOutline({
  font,
  gid,
  size = 26,
  fit = false,
  className,
  outline,
  coords,
}: {
  font: Font
  gid: number
  size?: number
  fit?: boolean
  className?: string
  outline?: OutlineFont
  coords?: Record<string, number>
}) {
  const glyph = font.glyphs.get(gid)
  const upm = font.unitsPerEm || 1000
  const nameFallback = (
    <span style={{ height: size * 1.5 }} className="flex items-center text-[10px] text-neutral-400 dark:text-neutral-600">
      {glyph?.name ?? '·'}
    </span>
  )

  // HarfBuzz path data (Y-UP font units, baseline at origin) at the current coords;
  // recomputed when gid/coords change. Null when no outline font is supplied — then
  // we fall back to the opentype.js branches below.
  const hb = useMemo(() => {
    if (!outline) return null
    void coords // memo key: section already set the font's variations
    const d = outline.glyphPath(gid)
    return { d, ext: fit ? outline.glyphExtents(gid) : undefined }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline, gid, coords, fit])

  if (fit) {
    let bb: { x1: number; y1: number; x2: number; y2: number } | undefined
    let d = ''
    if (hb) {
      // HB extents are Y-UP, height is negative (top = yBearing, grows downward).
      const e = hb.ext
      if (e) bb = { x1: e.xBearing, y1: e.yBearing + e.height, x2: e.xBearing + e.width, y2: e.yBearing }
      d = hb.d
    } else {
      // Path in font units (opentype.js getPath flips Y: screen y = -fontY).
      try {
        bb = glyph?.getBoundingBox()
        d = glyph?.getPath(0, 0, upm).toPathData(2) ?? ''
      } catch {
        d = ''
      }
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
        {/* opentype paths are already screen-space (Y-down); HB paths are Y-up → flip. */}
        <path d={d} transform={hb ? 'scale(1 -1)' : undefined} className="fill-current" />
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

  if (hb) {
    // HB path is Y-UP font units with the baseline at the origin: place the baseline
    // at `baseline` px and flip Y (screen y = baseline − fontY·s). Generating at an
    // integer origin sidesteps opentype.js's NaN-on-fractional-y composite bug.
    const s = size / upm
    if (!hb.d || hb.d.includes('NaN')) return nameFallback
    return (
      <svg width={Math.max(adv, size * 0.4)} height={lineBox} className={`overflow-visible ${className ?? ''}`}>
        <path d={hb.d} transform={`translate(0 ${baseline}) scale(${s} ${-s})`} className="fill-current" />
      </svg>
    )
  }

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
