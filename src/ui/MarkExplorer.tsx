import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Font } from 'opentype.js'
import { buildReverseCmap } from '../core/glyphs'
import { buildMarkInventory, type BaseGlyph, type MarkGlyph } from '../core/marks'
import { parseMarkAnchors, attachToBase, attachToMark, placeMarks, resolveAnchor, type Anchor } from '../core/markAnchors'
import { loadOutlineFont, type OutlineFont } from '../core/shape'
import { normalizeCoords, readAvarSegments } from '../core/coords'
import type { FontVariations } from '../core/variations'
import { loadUnicodeNames, unicodeName } from '../core/unicodeName'
import { ComposedGlyphs, type RenderItem } from './ComposedGlyphs'
import { GlyphOutline } from './GlyphOutline'
import { AxisControls } from './AxisControls'
import { codepoints } from './AffectedGlyphs'

type Names = Record<string, string> | null

/**
 * Full-screen overlay for exploring mark·mkmk attachment. Pick a base glyph (left)
 * and one or more combining marks (right); the preview composes them by GPOS
 * anchors (we position glyph OUTLINES ourselves — going through browser text would
 * normalize "a"+macron into the precomposed glyph and hide the real attachment).
 * Marks that can't attach to the selected base / current top mark are greyed out.
 * Rendered at the default instance (outlines + anchors are default-master).
 */
export function MarkExplorer({
  font,
  sfnt,
  variations,
  coords,
  onClose,
}: {
  font: Font
  sfnt: ArrayBuffer
  variations?: FontVariations | null
  coords?: Record<string, number>
  onClose: () => void
}) {
  const inv = useMemo(() => buildMarkInventory(font, buildReverseCmap(font)), [font])
  const ma = useMemo(() => parseMarkAnchors(sfnt), [sfnt])
  const axes = variations?.axes ?? []
  const instances = variations?.instances ?? []
  const [baseGid, setBaseGid] = useState<number | null>(inv.bases[0]?.gid ?? null)
  const [markGids, setMarkGids] = useState<number[]>([])
  const [tileSize, setTileSize] = useState(44)
  const [showAnchors, setShowAnchors] = useState(true)
  const [names, setNames] = useState<Names>(null)
  const [localCoords, setLocalCoords] = useState<Record<string, number>>(coords ?? {})
  const [outlineFont, setOutlineFont] = useState<OutlineFont | null>(null)
  const useVf = !!outlineFont && axes.length > 0
  // On viewports short by height (13" laptops), a stacked top preview gets clipped;
  // switch to a 3-column layout (bases · preview · marks) in a wider modal instead.
  const short = useMediaQuery('(max-height: 820px)')

  useEffect(() => {
    loadUnicodeNames().then(setNames).catch(() => undefined)
  }, [])

  // Isolated HB font for variable outlines (axes only); decoupled from the shared shaper.
  useEffect(() => {
    if (axes.length === 0) return
    let cancelled = false
    loadOutlineFont(sfnt).then((f) => !cancelled && setOutlineFont(f)).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sfnt, axes.length])

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

  // When the base changes, drop selected marks that can no longer attach in order.
  useEffect(() => {
    if (baseGid == null) return
    setMarkGids((prev) => {
      const kept: number[] = []
      for (const g of prev) {
        const top = kept.at(-1) ?? null
        if (attachToBase(ma, baseGid, g) || (top != null && attachToMark(ma, top, g))) kept.push(g)
      }
      return kept.length === prev.length ? prev : kept
    })
  }, [baseGid, ma])

  const topMark = markGids.at(-1) ?? null
  const enabled = useMemo(() => {
    const set = new Set<number>()
    if (baseGid == null) return set
    for (const m of inv.marks) {
      if (attachToBase(ma, baseGid, m.gid) || (topMark != null && attachToMark(ma, topMark, m.gid)))
        set.add(m.gid)
    }
    return set
  }, [ma, baseGid, topMark, inv])

  // Variable anchors: resolve at the current axis position (default-instance otherwise).
  const avarSeg = useMemo(() => (axes.length ? readAvarSegments(font, axes) : {}), [font, axes])
  const normCoords = useMemo(
    () => (axes.length ? normalizeCoords(localCoords, axes, avarSeg) : null),
    [localCoords, axes, avarSeg],
  )
  const resolve = useMemo(() => (a: Anchor) => resolveAnchor(a, ma.store, normCoords), [ma, normCoords])

  const { placed, unplaceable, anchorsUsed } = useMemo(
    () => (baseGid != null ? placeMarks(ma, baseGid, markGids, resolve) : { placed: [], unplaceable: [], anchorsUsed: [] }),
    [ma, baseGid, markGids, resolve],
  )

  // Render items: VF outlines via the isolated HB font, else opentype default master.
  const upm = font.unitsPerEm || 1000
  const items = useMemo<RenderItem[]>(() => {
    if (useVf && outlineFont) outlineFont.setVariations(localCoords)
    const out: RenderItem[] = []
    for (const p of placed) {
      if (useVf && outlineFont) {
        const d = outlineFont.glyphPath(p.gid)
        const e = outlineFont.glyphExtents(p.gid)
        if (!d || !e) continue
        out.push({ d, x: p.x, y: p.y, x1: e.xBearing, y1: e.yBearing + e.height, x2: e.xBearing + e.width, y2: e.yBearing })
      } else {
        const g = font.glyphs.get(p.gid)
        if (!g) continue
        let d = ''
        try {
          d = g.path.toPathData(2)
        } catch {
          d = ''
        }
        const bb = g.getBoundingBox()
        if (!d || !bb) continue
        out.push({ d, x: p.x, y: p.y, x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 })
      }
    }
    return out
  }, [useVf, outlineFont, localCoords, placed, font])

  const markByGid = useMemo(() => new Map(inv.marks.map((m) => [m.gid, m])), [inv])
  const base = inv.bases.find((b) => b.gid === baseGid)
  const seqGlyphs = [base, ...markGids.map((g) => markByGid.get(g))].filter(
    (g): g is BaseGlyph | MarkGlyph => !!g,
  )
  const cpLine = seqGlyphs.map((g) => (g.cp != null ? `U+${g.cp.toString(16).toUpperCase().padStart(4, '0')}` : '')).join(' ')
  const nameLine = seqGlyphs
    .map((g) => (g.cp != null ? unicodeName(g.cp, names) : undefined))
    .filter(Boolean)
    .join('  +  ')

  const toggleMark = (gid: number) =>
    setMarkGids((prev) => (prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]))

  const preview = (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      {base ? (
        <>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <ComposedGlyphs items={items} anchorsUsed={anchorsUsed} showAnchors={showAnchors} upm={upm} />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="font-mono text-[11px] text-neutral-400 dark:text-neutral-600">{cpLine}</div>
            {nameLine && <div className="max-w-xl text-center text-[11px] text-neutral-500 dark:text-neutral-400">{nameLine}</div>}
            {unplaceable.length > 0 && (
              <div className="text-[11px] text-amber-600 dark:text-amber-500">
                {unplaceable.length} mark{unplaceable.length === 1 ? '' : 's'} can't attach here (not rendered)
              </div>
            )}
            {!ma.hasMark && (
              <div className="text-[11px] text-neutral-400 dark:text-neutral-600">no parseable mark anchors — base only</div>
            )}
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-600">Select a base glyph below.</div>
      )}
      {axes.length > 0 && (
        <div className="w-full max-w-3xl">
          <AxisControls axes={axes} instances={instances} coords={localCoords} onCoords={setLocalCoords} />
        </div>
      )}
    </div>
  )

  const basesColumn = (
    <Column title={`Bases · ${inv.bases.length}`}>
      <div className="flex flex-wrap gap-1.5">
        {inv.bases.map((b) => (
          <Tile
            key={b.gid}
            font={font}
            glyph={b}
            size={tileSize}
            names={names}
            selected={b.gid === baseGid}
            onClick={() => setBaseGid(b.gid)}
          />
        ))}
      </div>
    </Column>
  )

  const marksColumn = (
    <Column
      title={`Marks · ${inv.marks.length}`}
      action={
        markGids.length > 0 ? (
          <button
            onClick={() => setMarkGids([])}
            className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Clear
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {inv.marks.map((m) => {
          const order = markGids.indexOf(m.gid)
          const isSelected = order >= 0
          return (
            <Tile
              key={m.gid}
              font={font}
              glyph={m}
              size={tileSize}
              names={names}
              selected={isSelected}
              disabled={!isSelected && !enabled.has(m.gid)}
              badge={isSelected ? order + 1 : undefined}
              onClick={() => toggleMark(m.gid)}
            />
          )
        })}
      </div>
    </Column>
  )

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
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Mark · mkmk explorer</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {useVf
                ? "Composed from the font's GPOS anchors — follows the current axis position."
                : "Composed from the font's GPOS anchors (default instance)."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <input type="checkbox" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} className="accent-indigo-500" />
              Anchors
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              Cells
              <input
                type="range"
                min={28}
                max={84}
                value={tileSize}
                onChange={(e) => setTileSize(Number(e.target.value))}
                className="accent-indigo-500"
              />
            </label>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {short ? (
          /* Short viewport: bases · preview · marks side by side (preview centered). */
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-px overflow-hidden bg-neutral-200 dark:bg-neutral-800">
            {basesColumn}
            <div className="flex min-h-0 flex-col overflow-y-auto bg-neutral-50 px-4 py-5 dark:bg-neutral-950/50">
              {preview}
            </div>
            {marksColumn}
          </div>
        ) : (
          <>
            {/* Tall viewport: preview on top, bases · marks below. A DEFINITE height
                (not min-h) so the fill-parent SVG can cap itself instead of overflowing. */}
            <div className="flex h-[44vh] shrink-0 flex-col items-center justify-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-6 dark:border-neutral-800 dark:bg-neutral-950/50">
              {preview}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-px overflow-hidden bg-neutral-200 dark:bg-neutral-800">
              {basesColumn}
              {marksColumn}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function Column({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col bg-neutral-50 dark:bg-neutral-950/50">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-500">
        <span>{title}</span>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">{children}</div>
    </div>
  )
}

function Tile({
  font,
  glyph,
  size,
  names,
  selected,
  disabled = false,
  badge,
  onClick,
}: {
  font: Font
  glyph: BaseGlyph | MarkGlyph
  size: number
  names: Names
  selected: boolean
  disabled?: boolean
  badge?: number
  onClick: () => void
}) {
  const style: CSSProperties = { width: size + 12, height: size + 12 }
  const name = glyph.cp != null ? unicodeName(glyph.cp, names) : (font.glyphs.get(glyph.gid)?.name ?? undefined)
  const cps = glyph.char ? codepoints(glyph.char) : undefined
  const title = [name, cps].filter(Boolean).join(' · ') || undefined
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      className={`relative flex items-center justify-center rounded-md border bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 ${
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-500'
          : disabled
            ? 'cursor-not-allowed border-neutral-200 opacity-40 grayscale dark:border-neutral-800'
            : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
      }`}
    >
      <GlyphOutline font={font} gid={glyph.gid} size={size} fit />
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-medium text-white">
          {badge}
        </span>
      )}
    </button>
  )
}
