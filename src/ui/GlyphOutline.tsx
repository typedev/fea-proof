import type { Font } from 'opentype.js'

/**
 * Render a glyph by its id straight from the font outline (not as text). Needed
 * for glyphs that have no Unicode mapping — e.g. variant glyphs produced by
 * rvrn (`a.italic`, `l.sans`) or the unreachable-glyph inventory.
 */
export function GlyphOutline({
  font,
  gid,
  size = 26,
  className,
}: {
  font: Font
  gid: number
  size?: number
  className?: string
}) {
  const upm = font.unitsPerEm || 1000
  const baseline = size * 0.82
  const height = size * 1.15
  const glyph = font.glyphs.get(gid)
  const scale = size / upm
  const adv = (glyph?.advanceWidth ?? upm) * scale
  let d = ''
  try {
    d = glyph?.getPath(0, baseline, size).toPathData(2) ?? ''
  } catch {
    d = ''
  }
  if (d.includes('NaN')) d = ''

  if (!d) {
    return (
      <span style={{ height }} className="flex items-center text-[10px] text-neutral-400 dark:text-neutral-600">
        {glyph?.name ?? '·'}
      </span>
    )
  }
  return (
    <svg width={Math.max(adv, size * 0.4)} height={height} className={`overflow-visible ${className ?? ''}`}>
      <path d={d} className="fill-current" />
    </svg>
  )
}
