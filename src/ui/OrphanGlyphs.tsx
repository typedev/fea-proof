import { useState } from 'react'
import type { Font } from 'opentype.js'
import { GlyphOutline } from './GlyphOutline'

const INITIAL = 80

/**
 * "Lost" glyphs — present in the font but with no Unicode mapping and untouched by
 * any feature (besides kerning/marks), so unreachable by normal means. Rendered
 * directly from their outlines (they can't be addressed as text). Uses the shared
 * GlyphOutline + glyph-inventory tile style and size cap (Math.min(size, 30)).
 */
export function OrphanGlyphs({ font, gids, size = 30 }: { font: Font; gids: number[]; size?: number }) {
  const [showAll, setShowAll] = useState(false)
  if (gids.length === 0) return null
  const shown = showAll ? gids : gids.slice(0, INITIAL)
  const glyphSize = Math.min(size, 30)

  return (
    <section id="unreachable-glyphs" style={{ scrollMarginTop: 'var(--scroll-offset, 1rem)' }} className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Unreachable glyphs</h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {gids.length} glyph{gids.length === 1 ? '' : 's'} have no Unicode mapping and aren't used by any
        feature (other than kerning/marks) — they can't be typed or produced by any feature toggle, so
        they're effectively unreachable.
      </p>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
        {shown.map((gid) => (
          <div
            key={gid}
            title={`${font.glyphs.get(gid)?.name ?? 'glyph'} · gid ${gid}`}
            className="flex flex-col items-center rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <GlyphOutline font={font} gid={gid} size={glyphSize} className="text-neutral-900 dark:text-neutral-100" />
            <span className="font-mono text-[9px] text-neutral-400 dark:text-neutral-600">{gid}</span>
          </div>
        ))}
      </div>
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
