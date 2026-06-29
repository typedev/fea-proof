import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Font } from 'opentype.js'
import type { CombinationGroup, FeatureToggle } from '../core/combinations'
import type { Shaper } from '../core/shape'
import { buildFormMatrix, type FormMatrix } from '../core/matrix'

interface Item {
  frag: string
  features: FeatureToggle[]
}

/**
 * Fullscreen explorer: one row per base fragment (a glyph, or a ligature/contextual
 * sequence), showing every distinct form it reaches across combinations of the
 * features affecting it, each rendered by output gid (so feature-produced/non-cmapped
 * forms show too) and labelled with the minimal combination that produces it. Glyphs
 * are baseline-aligned. Rows compute lazily as they scroll into view.
 */
export function CombinationMatrix({
  font,
  groups,
  shaper,
  onClose,
}: {
  font: Font
  groups: CombinationGroup[]
  shaper: Shaper
  onClose: () => void
}) {
  const [glyphSize, setGlyphSize] = useState(36)

  const items = useMemo<Item[]>(() => {
    const seen = new Set<string>()
    const out: Item[] = []
    for (const g of groups) {
      for (const frag of g.chars) {
        if (seen.has(frag)) continue
        seen.add(frag)
        // A multi-glyph fragment is only meaningful here if it can LIGATE — drop
        // sequences that never change glyph count (long-string artifacts whose only
        // forms are per-component restyles). Cheap 2-shape probe (full matrix stays
        // lazy). Single glyphs always kept.
        if ([...frag].length > 1) {
          try {
            const base = shaper.shape(frag, { features: [] }).length
            const allOn = shaper.shape(frag, { features: g.features.map((f) => `${f.tag}=1`) }).length
            if (allOn >= base) continue
          } catch {
            continue
          }
        }
        out.push({ frag, features: g.features })
      }
    }
    return out
  }, [groups, shaper])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Feature combinations matrix · {items.length}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Every distinct form a glyph reaches, labelled with the minimal feature combination that produces it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              Size
              <input
                type="range"
                min={20}
                max={72}
                value={glyphSize}
                onChange={(e) => setGlyphSize(Number(e.target.value))}
                className="accent-indigo-500"
              />
            </label>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              ✕
            </button>
          </div>
        </div>

        {/* One row per glyph (computed lazily on scroll) */}
        <div className="min-h-0 flex-1 divide-y divide-neutral-200 overflow-y-auto dark:divide-neutral-800">
          {items.map((it) => (
            <GlyphRow key={it.frag} font={font} item={it} shaper={shaper} size={glyphSize} />
          ))}
          {items.length === 0 && (
            <div className="px-4 py-8 text-sm text-neutral-400 dark:text-neutral-600">No combinable glyphs.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function GlyphRow({ font, item, shaper, size }: { font: Font; item: Item; shaper: Shaper; size: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [matrix, setMatrix] = useState<FormMatrix | null>(null)

  // Compute this row's matrix only once it nears the viewport.
  useEffect(() => {
    setMatrix(null)
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          setMatrix(buildFormMatrix(shaper, item.frag, item.features))
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [item.frag, item.features, shaper])

  return (
    <div ref={ref} className="flex items-start gap-3 px-4 py-3" style={{ minHeight: size * 1.7 }}>
      <div
        className="w-10 shrink-0 pt-2 font-mono text-xs text-neutral-400 dark:text-neutral-500"
        title={item.features.map((f) => f.tag).join(', ')}
      >
        {item.frag}
      </div>
      {matrix ? (
        <div className="flex flex-wrap gap-3">
          <FormTile font={font} gids={matrix.baseline} size={size} label="plain" />
          {matrix.forms.map((form, i) => (
            <FormTile key={i} font={font} gids={form.gids} size={size} combo={form.combo} />
          ))}
          {matrix.forms.length === 0 && (
            <span className="pt-2 text-xs text-neutral-400 dark:text-neutral-600">no distinct forms</span>
          )}
        </div>
      ) : (
        <div className="pt-2 text-xs text-neutral-300 dark:text-neutral-700">…</div>
      )}
    </div>
  )
}

function FormTile({
  font,
  gids,
  size,
  combo,
  label,
}: {
  font: Font
  gids: number[]
  size: number
  combo?: FeatureToggle[]
  label?: string
}) {
  const caption = label ?? combo?.map((f) => f.tag).join(' + ') ?? ''
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-end justify-center rounded-md border border-neutral-200 bg-white px-2 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        style={{ minHeight: size * 1.2, minWidth: size * 0.8 }}
      >
        <GlyphRun font={font} gids={gids} size={size} />
      </div>
      <div
        className={`max-w-[10rem] text-center text-[10px] ${
          label ? 'text-neutral-400 dark:text-neutral-600' : 'font-mono text-indigo-600 dark:text-indigo-400'
        }`}
      >
        {caption}
      </div>
    </div>
  )
}

/** A run of output gids rendered by outline, all sharing one baseline. */
function GlyphRun({ font, gids, size }: { font: Font; gids: number[]; size: number }): ReactNode {
  if (gids.length === 0) return <span className="text-neutral-300 dark:text-neutral-700">·</span>
  return (
    <span className="flex items-start">
      {gids.map((g, i) => (
        <BaselineGlyph key={i} font={font} gid={g} size={size} />
      ))}
    </span>
  )
}

/**
 * Render a glyph by id in EM units with a baseline-anchored viewBox: every glyph
 * shares the same vertical range (ascender→descender, baseline at y=0), so figure
 * forms keep their real height/position and all glyphs sit on one baseline. Em-unit
 * coordinates also avoid opentype's small-scale `toPathData` rounding glitches.
 */
function BaselineGlyph({ font, gid, size }: { font: Font; gid: number; size: number }) {
  const glyph = font.glyphs.get(gid)
  const upm = font.unitsPerEm || 1000
  const ascent = font.ascender || upm * 0.8
  const descent = font.descender || -upm * 0.2 // negative
  let d = ''
  try {
    d = glyph?.getPath(0, 0, upm).toPathData(1) ?? ''
  } catch {
    d = ''
  }
  if (!d || d.includes('NaN')) {
    return (
      <span style={{ height: size }} className="flex items-center px-0.5 text-[9px] text-neutral-400 dark:text-neutral-600">
        {glyph?.name ?? '·'}
      </span>
    )
  }
  const adv = glyph?.advanceWidth || upm
  const vbH = ascent - descent
  return (
    <svg
      viewBox={`0 ${-ascent} ${adv} ${vbH}`}
      height={(size * vbH) / upm}
      width={(size * adv) / upm}
      className="overflow-visible"
    >
      <path d={d} className="fill-current" />
    </svg>
  )
}
