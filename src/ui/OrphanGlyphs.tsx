import { useState } from 'react'
import type { Font } from 'opentype.js'
import type { OutlineFont } from '../core/shape'
import { GlyphOutline, outlineBaseline } from './GlyphOutline'
import { useGlyphInfo } from '../render/glyphInfoContext'
import { gidDatum, popoverSize, useGlyphPopover, type PopoverContent } from './GlyphInfoPopover'

const INITIAL = 80

const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0')

/**
 * "Lost" glyphs, untouched by any feature (besides kerning/marks), in two kinds:
 * `unreachable` — no Unicode mapping at all; `pua` — mapped ONLY to Private Use
 * Area code points (typeable just if you know them). Rendered directly from their
 * outlines (same path for both, so no reliance on PUA text rendering). Uses the
 * shared GlyphOutline + glyph-inventory tile style and size cap (Math.min(size, 30)).
 */
export function OrphanGlyphs({
  kind,
  font,
  gids,
  size = 30,
  outline,
  coords,
}: {
  kind: 'unreachable' | 'pua'
  font: Font
  gids: number[]
  size?: number
  outline?: OutlineFont
  coords?: Record<string, number>
}) {
  const [showAll, setShowAll] = useState(false)
  const info = useGlyphInfo()
  const pop = useGlyphPopover()
  if (gids.length === 0) return null
  const shown = showAll ? gids : gids.slice(0, INITIAL)
  const glyphSize = Math.min(size, 30)
  // Aim the shared HB outline font at the current coords before the tiles render.
  if (outline && coords) outline.setVariations(coords)
  // PUA tiles show the code point (how you'd reach them); unreachable ones the gid.
  const tileLabel = (gid: number) => {
    const cp = kind === 'pua' ? info?.reverseCmap.get(gid)?.[0] : undefined
    return cp === undefined ? gid : `U+${hex(cp)}`
  }

  return (
    <section
      id={kind === 'pua' ? 'pua-only-glyphs' : 'unreachable-glyphs'}
      style={{ scrollMarginTop: 'var(--scroll-offset, 1rem)' }}
      className="space-y-2"
    >
      <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {kind === 'pua' ? 'Glyphs reachable only via PUA' : 'Unreachable glyphs'}
      </h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {kind === 'pua' ? (
          <>
            {gids.length} glyph{gids.length === 1 ? '' : 's'} are mapped only to Private Use Area code
            points and aren't used by any feature (other than kerning/marks) — they can only be reached by
            typing the PUA code point directly.
          </>
        ) : (
          <>
            {gids.length} glyph{gids.length === 1 ? '' : 's'} have no Unicode mapping and aren't used by any
            feature (other than kerning/marks) — they can't be typed or produced by any feature toggle, so
            they're effectively unreachable.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
        {shown.map((gid) => {
          const build = (): PopoverContent => ({
            preview: (
              <GlyphOutline
                font={font}
                gid={gid}
                size={popoverSize(size)}
                outline={outline}
                coords={coords}
                className="text-neutral-900 dark:text-neutral-100"
              />
            ),
            columns: [{ label: 'glyph', glyphs: [gidDatum(info, gid)] }],
            baseline: outlineBaseline(font, popoverSize(size)),
          })
          return (
            <div
              key={gid}
              {...pop.tileProps(`${kind}-${gid}`, build)}
              className="flex cursor-pointer flex-col items-center rounded-md border border-neutral-200 bg-white px-2 py-1 outline-none hover:border-neutral-300 focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <GlyphOutline font={font} gid={gid} size={glyphSize} outline={outline} coords={coords} className="text-neutral-900 dark:text-neutral-100" />
              <span className="font-mono text-[9px] text-neutral-400 dark:text-neutral-600">
                {tileLabel(gid)}
              </span>
            </div>
          )
        })}
      </div>
      {pop.node}
      {gids.length > INITIAL && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAll ? 'Show fewer' : `Show all ${gids.length}`}
        </button>
      )}
    </section>
  )
}
