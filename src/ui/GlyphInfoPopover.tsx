import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { type GlyphInfo } from '../render/glyphInfoContext'
import type { Shaper, ShapeVariant } from '../core/shape'

export interface GlyphDatum {
  gid: number
  name: string
  unicodes: number[]
}

export interface PopoverColumn {
  label: string
  glyphs: GlyphDatum[]
}

export interface PopoverContent {
  /** The pair / glyph run, rendered large (CSS text or outline). */
  preview: ReactNode
  /** Optional demo word, already rendered (with highlight). */
  word?: ReactNode
  /** One or more labelled columns of glyph facts. */
  columns: PopoverColumn[]
  /**
   * Draw a thin baseline guide under the preview so index marks (sups/subs/numr/
   * dnom) can be judged against it. `true` measures the CSS-text baseline of the
   * preview via a probe; a number is an explicit y (px from the preview top), used
   * by outline previews whose box baseline isn't the typographic one
   * (see `outlineBaseline`). Omit for no guide.
   */
  baseline?: boolean | number
}

/** Popover glyphs render 40% larger than the size regulator — always bigger than the
 * feature cells, which reads better for inspecting a single glyph. */
export function popoverSize(size: number): number {
  return Math.round(size * 1.4)
}

function uPlus(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
}

/** Full facts for one glyph id: name (or `gidN`), gid, and any Unicode code point(s). */
export function gidDatum(info: GlyphInfo | null, gid: number): GlyphDatum {
  return {
    gid,
    name: info?.font.glyphs.get(gid)?.name ?? `gid${gid}`,
    unicodes: info?.reverseCmap.get(gid) ?? [],
  }
}

/** Shape `item` under `variant` (feature toggles or language) and resolve each output glyph. */
export function shapeData(
  shaper: Shaper | undefined,
  info: GlyphInfo | null,
  item: string,
  variant: ShapeVariant,
): GlyphDatum[] {
  if (!shaper) return []
  let shaped
  try {
    shaped = shaper.shape(item, variant)
  } catch {
    return []
  }
  return shaped.filter((g) => g.g !== 0).map((g) => gidDatum(info, g.g))
}

function GlyphColumn({ label, glyphs }: PopoverColumn) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{label}</div>
      {glyphs.length === 0 ? (
        <div className="text-xs text-neutral-400 dark:text-neutral-600">—</div>
      ) : (
        <div className="space-y-1.5">
          {glyphs.map((g, i) => (
            <div key={i} className="min-w-0">
              <div className="break-all font-mono text-xs text-neutral-800 dark:text-neutral-200">{g.name}</div>
              <div className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                gid {g.gid}
                {g.unicodes.length > 0 && ' · ' + g.unicodes.map(uPlus).join(' ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Floating detail card for a glyph cell, opened by clicking a tile. Shows the
 * cell's content (pair / glyph run and any demo word) large, plus the full
 * gid + Unicode + glyph-name for every glyph involved. Rendered in a portal,
 * anchored below the clicked tile and clamped to the viewport; closes on outside
 * click / Esc.
 */
function GlyphInfoPopover({
  content,
  anchor,
  onClose,
}: {
  content: PopoverContent
  anchor: DOMRect
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [baselineY, setBaselineY] = useState<number | null>(null)

  // Baseline guide y (px from the preview top). For CSS-text previews (`baseline:
  // true`) measure it via a zero-height inline-block probe aligned to the text
  // baseline; outline previews pass an explicit number (their box has no text baseline).
  const useProbe = content.baseline === true
  useLayoutEffect(() => {
    if (typeof content.baseline === 'number') {
      setBaselineY(content.baseline)
      return
    }
    if (!useProbe || !previewRef.current || !probeRef.current) {
      setBaselineY(null)
      return
    }
    const y = probeRef.current.getBoundingClientRect().top - previewRef.current.getBoundingClientRect().top
    setBaselineY(y)
  }, [content, useProbe])

  // Position below the tile, flipping above and clamping horizontally to stay on-screen.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const { width, height } = card.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let top = anchor.bottom + margin
    if (top + height > vh - margin) {
      const above = anchor.top - height - margin
      top = above >= margin ? above : Math.max(margin, vh - height - margin)
    }
    const left = Math.min(Math.max(margin, anchor.left), vw - width - margin)
    setPos({ top, left })
  }, [anchor, content])

  // Close on Escape or a click outside the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-50 w-max min-w-[15rem] max-w-[90vw] rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div
        ref={previewRef}
        className={`relative flex justify-center gap-3 ${useProbe ? 'items-baseline' : 'items-center'}`}
      >
        {content.preview}
        {useProbe && <span ref={probeRef} aria-hidden style={{ display: 'inline-block', width: 0, alignSelf: 'baseline' }} />}
        {baselineY != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-indigo-400/50 dark:border-indigo-400/40"
            style={{ top: baselineY }}
          />
        )}
      </div>
      {content.word && (
        <div className="mt-3 border-t border-neutral-100 pt-3 text-center dark:border-neutral-800">{content.word}</div>
      )}
      <div className="mt-3 flex gap-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        {content.columns.map((c, i) => (
          <GlyphColumn key={i} {...c} />
        ))}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Manages a single open glyph-info popover for a grid: `toggle(key, tileEl, build)`
 * opens (or closes, if the same tile) a popover anchored to `tileEl`, computing its
 * content lazily via `build`; `node` is the popover element to render once in the
 * grid. Consolidates the click/keyboard/anchor boilerplate shared by every glyph grid.
 */
export function useGlyphPopover() {
  const [open, setOpen] = useState<{ key: string; rect: DOMRect; content: PopoverContent } | null>(null)
  const close = () => setOpen(null)
  const toggle = (key: string, el: HTMLElement, build: () => PopoverContent) =>
    setOpen((cur) => (cur?.key === key ? null : { key, rect: el.getBoundingClientRect(), content: build() }))
  /** Spread onto a clickable tile: role/tabIndex/onClick/onKeyDown wired to `build`. */
  const tileProps = (key: string, build: () => PopoverContent) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: { currentTarget: HTMLElement }) => toggle(key, e.currentTarget, build),
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle(key, e.currentTarget, build)
      }
    },
  })
  const node = open ? <GlyphInfoPopover anchor={open.rect} onClose={close} content={open.content} /> : null
  return { openKey: open?.key ?? null, toggle, tileProps, close, node }
}
