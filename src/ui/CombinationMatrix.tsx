import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Font } from 'opentype.js'
import type { CombinationGroup, FeatureToggle } from '../core/combinations'
import type { Shaper } from '../core/shape'
import { buildFormMatrix } from '../core/matrix'
import { GlyphOutline } from './GlyphOutline'
import { useMediaQuery } from './useMediaQuery'

interface BaseItem {
  frag: string
  features: FeatureToggle[]
}

/**
 * Fullscreen explorer that, for a chosen base glyph, enumerates the powerset of the
 * features affecting it and shows every DISTINCT reachable form (rendered by output
 * gid, so feature-produced/non-cmapped glyphs show too), each labelled with the
 * minimal feature combination that produces it. Rendered at the default master.
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
  const short = useMediaQuery('(max-height: 820px)')
  const [tileSize, setTileSize] = useState(40)
  const [selIdx, setSelIdx] = useState(0)

  // Flatten groups → unique base fragments, each mapped to its relevant features.
  const items = useMemo<BaseItem[]>(() => {
    const seen = new Set<string>()
    const out: BaseItem[] = []
    for (const g of groups) {
      for (const frag of g.chars) {
        if (seen.has(frag)) continue
        seen.add(frag)
        out.push({ frag, features: g.features })
      }
    }
    return out
  }, [groups])

  const sel = items[selIdx] ?? items[0]

  // Baseline gids per fragment (one cheap shape each) for the left-column tiles.
  const baseGids = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const it of items) {
      try {
        m.set(it.frag, shaper.shape(it.frag, { features: [] }).map((g) => g.g))
      } catch {
        m.set(it.frag, [])
      }
    }
    return m
  }, [items, shaper])

  const matrix = useMemo(() => (sel ? buildFormMatrix(shaper, sel.frag, sel.features) : null), [sel, shaper])

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

  const cap = Math.min(tileSize, 30)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900 ${
          short ? 'max-w-[92rem]' : 'max-w-5xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Feature combinations matrix</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Every distinct form a glyph reaches, with the minimal feature combination that produces it (default master).
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              Size
              <input
                type="range"
                min={28}
                max={72}
                value={tileSize}
                onChange={(e) => setTileSize(Number(e.target.value))}
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

        {/* Body: glyph list | matrix */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-px overflow-hidden bg-neutral-200 dark:bg-neutral-800">
          <Column title={`Glyphs · ${items.length}`}>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it, i) => (
                <BaseTile
                  key={it.frag}
                  font={font}
                  gids={baseGids.get(it.frag) ?? []}
                  label={it.frag}
                  size={cap}
                  selected={i === selIdx}
                  onClick={() => setSelIdx(i)}
                />
              ))}
            </div>
          </Column>

          <Column title={sel ? `Forms of “${sel.frag}”` : 'Forms'}>
            {sel && matrix ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-400">affected by</span>
                  {sel.features.map((f) => (
                    <span
                      key={f.tag}
                      title={f.name}
                      className="rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      {f.tag}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <FormTile font={font} gids={matrix.baseline} size={cap} label="plain" />
                  {matrix.forms.map((form, i) => (
                    <FormTile key={i} font={font} gids={form.gids} size={cap} combo={form.combo} comboCount={form.comboCount} />
                  ))}
                </div>
                {matrix.forms.length === 0 && (
                  <div className="text-xs text-neutral-400 dark:text-neutral-600">No combination changes this glyph.</div>
                )}
                {matrix.truncated && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-500">
                    Showing the first 12 features — combinations of the rest aren’t enumerated.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-sm text-neutral-400 dark:text-neutral-600">Select a glyph.</div>
            )}
          </Column>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col bg-neutral-50 dark:bg-neutral-950/50">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-500">{title}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">{children}</div>
    </div>
  )
}

/** Render a run of output gids by outline (one glyph per gid). */
function GlyphRun({ font, gids, size }: { font: Font; gids: number[]; size: number }) {
  if (gids.length === 0) return <span className="text-neutral-300 dark:text-neutral-700">·</span>
  return (
    <span className="flex items-center">
      {gids.map((g, i) => (
        <GlyphOutline key={i} font={font} gid={g} size={size} fit />
      ))}
    </span>
  )
}

function BaseTile({
  font,
  gids,
  label,
  size,
  selected,
  onClick,
}: {
  font: Font
  gids: number[]
  label: string
  size: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{ height: size + 12, minWidth: size + 12 }}
      className={`flex items-center justify-center rounded-md border bg-white px-1.5 dark:bg-neutral-900 ${
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-500'
          : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
      }`}
    >
      <GlyphRun font={font} gids={gids} size={size} />
    </button>
  )
}

function FormTile({
  font,
  gids,
  size,
  combo,
  comboCount,
  label,
}: {
  font: Font
  gids: number[]
  size: number
  combo?: FeatureToggle[]
  comboCount?: number
  label?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-center" style={{ minHeight: size }}>
        <GlyphRun font={font} gids={gids} size={size} />
      </div>
      <div className="flex max-w-[10rem] flex-wrap items-center justify-center gap-1">
        {label && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {label}
          </span>
        )}
        {combo?.map((f) => (
          <span
            key={f.tag}
            title={f.name}
            className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
          >
            {f.tag}
          </span>
        ))}
        {comboCount != null && comboCount > 1 && (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-600" title={`${comboCount} combinations reach this form`}>
            +{comboCount - 1}
          </span>
        )}
      </div>
    </div>
  )
}
