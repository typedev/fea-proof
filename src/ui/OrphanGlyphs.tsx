import { useState } from 'react'
import type { Font } from 'opentype.js'

const INITIAL = 80

/**
 * "Lost" glyphs — present in the font but with no Unicode mapping and untouched by
 * any feature (besides kerning/marks), so unreachable by normal means. Rendered
 * directly from their outlines (they can't be addressed as text).
 */
export function OrphanGlyphs({ font, gids, size = 30 }: { font: Font; gids: number[]; size?: number }) {
  const [showAll, setShowAll] = useState(false)
  if (gids.length === 0) return null
  const shown = showAll ? gids : gids.slice(0, INITIAL)
  const upm = font.unitsPerEm || 1000
  const fs = Math.min(size, 26)
  const baseline = fs * 0.82
  const height = fs * 1.15

  return (
    <section id="unreachable-glyphs" style={{ scrollMarginTop: 'var(--scroll-offset, 1rem)' }} className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Unreachable glyphs</h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {gids.length} glyph{gids.length === 1 ? '' : 's'} have no Unicode mapping and aren't used by any
        feature (other than kerning/marks) — they can't be typed or produced by any feature toggle, so
        they're effectively unreachable.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((gid) => {
          const glyph = font.glyphs.get(gid)
          const scale = fs / upm
          const adv = (glyph.advanceWidth ?? upm) * scale
          let d = ''
          try {
            d = glyph.getPath(0, baseline, fs).toPathData(2)
          } catch {
            d = ''
          }
          if (d.includes('NaN')) d = '' // some composite/empty glyphs yield invalid paths
          return (
            <div
              key={gid}
              title={`${glyph.name ?? 'glyph'} · gid ${gid}`}
              className="flex flex-col items-center rounded-md border border-neutral-200 bg-white px-1.5 py-1 dark:border-neutral-800 dark:bg-neutral-900"
            >
              {d ? (
                <svg
                  width={Math.max(adv, fs * 0.5)}
                  height={height}
                  className="overflow-visible text-neutral-900 dark:text-neutral-100"
                >
                  <path d={d} className="fill-current" />
                </svg>
              ) : (
                <span
                  style={{ height }}
                  className="flex items-center text-[10px] text-neutral-400 dark:text-neutral-600"
                >
                  {glyph.name ?? '·'}
                </span>
              )}
              <span className="font-mono text-[9px] text-neutral-400 dark:text-neutral-600">{gid}</span>
            </div>
          )
        })}
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
