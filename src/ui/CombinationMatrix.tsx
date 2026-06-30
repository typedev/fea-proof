import { useEffect, useMemo, useRef, useState } from 'react'
import type { Font } from 'opentype.js'
import type { CombinationGroup, FeatureToggle } from '../core/combinations'
import type { Shaper } from '../core/shape'
import { buildFormMatrix, type FormMatrix } from '../core/matrix'
import { GlyphOutline } from './GlyphOutline'

/** Scroll the page to a feature's card by tag (matches any GSUB/GPOS card id). */
function scrollToFeature(tag: string) {
  document.querySelector(`[id^="feat-${tag}-"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

interface Item {
  frag: string
  features: FeatureToggle[]
  matrix: FormMatrix
}

/** Rows shown before the "Show all" expander (like the other inventory cards). */
const INITIAL = 12

/**
 * Inline section: one row per base fragment (a glyph, or a ligature/contextual
 * sequence) whose features GENUINELY COMBINE, showing each distinct combined form
 * (rendered by output gid, so feature-produced/non-cmapped forms show too) labelled
 * with the minimal combination that produces it. Fragments with no real combination
 * — parallel single-feature alternates only — are dropped (`buildFormMatrix` returns
 * no forms; they live on each feature's own card). The full matrices are cheap to
 * compute up front (~0.1 ms each), so they're built eagerly to filter empty rows and
 * keep an honest count; row CONTENT mounts lazily on scroll. A "Show all" button
 * reveals the rest — mirrors the single-feature cards.
 */
export function CombinationMatrix({
  font,
  groups,
  shaper,
  size = 30,
}: {
  font: Font
  groups: CombinationGroup[]
  shaper?: Shaper
  size?: number
}) {
  const [showAll, setShowAll] = useState(false)

  const items = useMemo<Item[]>(() => {
    if (!shaper) return []
    const seen = new Set<string>()
    const out: Item[] = []
    for (const g of groups) {
      for (const frag of g.chars) {
        if (seen.has(frag)) continue
        seen.add(frag)
        // Build the (filtered) form matrix now — it's cheap, and lets us drop
        // fragments whose features don't genuinely combine (no forms left) plus any
        // non-ligating multi-glyph artifact (its per-component restyles aren't
        // coherent, so no forms either). Surviving rows are real combinations.
        let matrix: FormMatrix
        try {
          matrix = buildFormMatrix(shaper, frag, g.features)
        } catch {
          continue
        }
        if (matrix.forms.length === 0) continue
        out.push({ frag, features: g.features, matrix })
      }
    }
    return out
  }, [groups, shaper])

  if (!shaper || items.length === 0) return null

  const shown = showAll ? items : items.slice(0, INITIAL)
  const glyphSize = Math.min(size, 30)

  return (
    <section
      id="feature-combinations"
      style={{ scrollMarginTop: 'var(--scroll-offset, 1rem)' }}
      className="space-y-2"
    >
      <div className="px-1">
        <h2 className="text-lg font-semibold">
          Feature combinations <span className="font-normal text-neutral-400">· {items.length}</span>
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Glyphs whose features genuinely combine — each distinct stacked form (features applied in the
          font's LookupList order) labelled with the minimal combination that produces it. Click a tag
          to jump to that feature.
        </p>
      </div>
      <div className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950/50">
        {shown.map((it) => (
          <GlyphRow key={it.frag} font={font} item={it} size={glyphSize} />
        ))}
      </div>
      {items.length > INITIAL && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAll ? 'Show fewer' : `Show all ${items.length} combinations`}
        </button>
      )}
    </section>
  )
}

function GlyphRow({ font, item, size }: { font: Font; item: Item; size: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const { matrix } = item

  // The matrix is precomputed; only DEFER mounting this row's (SVG-heavy) content
  // until it nears the viewport, so "Show all" doesn't render everything at once.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          setVisible(true)
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="flex items-start gap-3 px-4 py-3" style={{ minHeight: size * 1.7 }}>
      <div
        className="w-20 shrink-0 break-all pt-1.5 font-mono text-lg font-medium text-neutral-700 dark:text-neutral-200"
        title={item.features.map((f) => f.tag).join(', ')}
      >
        {item.frag}
      </div>
      {visible ? (
        <div className="flex flex-wrap gap-3">
          <FormTile font={font} gids={matrix.baseline} size={size} label="plain" />
          {matrix.forms.map((form, i) => (
            <FormTile key={i} font={font} gids={form.gids} size={size} combo={form.combo} />
          ))}
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
  const isPlain = !!label
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
        style={{ minWidth: size }}
      >
        <GlyphRun font={font} gids={gids} size={size} muted={isPlain} />
      </div>
      {isPlain ? (
        <div className="max-w-[10rem] text-center text-[10px] text-neutral-400 dark:text-neutral-600">{label}</div>
      ) : (
        <div className="max-w-[10rem] text-center font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
          {combo?.map((f, i) => (
            <span key={f.tag}>
              {i > 0 && <span className="text-neutral-400 dark:text-neutral-600"> + </span>}
              <button
                type="button"
                onClick={() => scrollToFeature(f.tag)}
                title={`Jump to ${f.name}`}
                className="hover:underline"
              >
                {f.tag}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A run of output gids rendered by the shared GlyphOutline (default mode), which
 * positions each glyph exactly like text at `font-size: size; line-height: 1.5` — same
 * size AND baseline as the single-feature cards' glyph cells. Same-height boxes, so a
 * multi-glyph run shares one baseline.
 */
function GlyphRun({ font, gids, size, muted }: { font: Font; gids: number[]; size: number; muted?: boolean }) {
  const color = muted ? 'text-neutral-400 dark:text-neutral-600' : 'text-neutral-900 dark:text-neutral-100'
  if (gids.length === 0)
    return (
      <span className="flex items-center text-neutral-300 dark:text-neutral-700" style={{ height: size * 1.5 }}>
        ·
      </span>
    )
  return (
    <span className="flex items-end gap-px">
      {gids.map((g, i) => (
        <GlyphOutline key={i} font={font} gid={g} size={size} className={color} />
      ))}
    </span>
  )
}
