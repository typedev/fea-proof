import { useState, type CSSProperties } from 'react'

const INITIAL = 40

/** Alternate features (aalt/salt): each base glyph (default, muted) + its alternates. */
export function AltGrid({
  cssFamily,
  tag,
  alternates,
  size = 30,
}: {
  cssFamily: string
  tag: string
  alternates: { char: string; indices: number[] }[]
  size?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? alternates : alternates.slice(0, INITIAL)
  const family = `"${cssFamily}", system-ui`
  const glyph = (k: number): CSSProperties => ({
    fontFamily: family,
    fontSize: Math.min(size, 32),
    fontFeatureSettings: `"${tag}" ${k}`,
  })

  const cell = 'inline-flex min-w-[1.5em] items-center justify-center'

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        {alternates.length} glyphs with alternates
      </div>
      {/* One row per base glyph; its alternates wrap within the card width so a
          glyph with dozens of alternates no longer overflows horizontally. */}
      <div className="space-y-1.5">
        {shown.map((entry) => (
          <div
            key={entry.char}
            className="flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-md border border-neutral-200 bg-white p-1.5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span style={glyph(0)} className={`${cell} mr-0.5 text-neutral-400 dark:text-neutral-600`}>
              {entry.char}
            </span>
            <span className="mr-0.5 text-[10px] text-neutral-300 dark:text-neutral-700">→</span>
            {entry.indices.map((k) => (
              <span key={k} style={glyph(k)} className={`${cell} text-neutral-900 dark:text-neutral-100`}>
                {entry.char}
              </span>
            ))}
          </div>
        ))}
      </div>
      {alternates.length > INITIAL && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAll ? 'Show fewer' : `Show all ${alternates.length}`}
        </button>
      )}
    </div>
  )
}
