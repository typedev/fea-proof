import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { highlightRanges } from '../render/highlight'
import type { Spotlight } from '../samples/spotlight'

const POPOVER_WIDTH = 380

/** Persistent affordance marking a tile as clickable (per-glyph word spotlight). */
export const INTERACTIVE_TILE_CLASS =
  'cursor-pointer transition-transform hover:-translate-y-px shadow-[inset_0_-2px_0_rgb(129_140_248/0.5)]'

export function codepoints(item: string): string {
  return [...item].map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')
}

interface Side {
  label: string
  /** Extra CSS for this side (fontFeatureSettings or fontLanguageOverride). */
  css: CSSProperties
  /** lang attribute for the after side (locl). */
  lang?: string
}

export interface SpotlightConfig {
  build: (item: string, attempt: number) => Promise<Spotlight>
  cssFamily: string
  size: number
  before: Side
  after: Side
}

/**
 * Shared per-glyph hover spotlight: hovering (or focusing) a tile pops a
 * before/after proof of THAT glyph on a real word; clicking pins it so you can
 * pull another word. Used by both the affected-glyphs grid (feature settings)
 * and the locl inventory (language override).
 */
export function useGlyphSpotlight(cfg: SpotlightConfig) {
  const [active, setActive] = useState<{ item: string; rect: DOMRect } | null>(null)
  const [pinned, setPinned] = useState(false)
  const [cache, setCache] = useState<Record<string, Spotlight>>({})
  const [attempts, setAttempts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)

  const fetchSpotlight = useCallback(
    (item: string, attempt: number, force: boolean) => {
      if (!force && cache[item]) return
      const id = ++reqId.current
      setLoading(true)
      cfg
        .build(item, attempt)
        .then((sp) => {
          if (id !== reqId.current) return
          setCache((prev) => ({ ...prev, [item]: sp }))
          setLoading(false)
        })
        .catch(() => {
          if (id === reqId.current) setLoading(false)
        })
    },
    [cache, cfg],
  )

  const open = useCallback(
    (item: string, el: HTMLElement) => {
      setActive({ item, rect: el.getBoundingClientRect() })
      fetchSpotlight(item, attempts[item] ?? 0, false)
    },
    [fetchSpotlight, attempts],
  )

  const close = useCallback(() => {
    setActive(null)
    setPinned(false)
  }, [])

  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinned, close])

  const handlers = (item: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (pinned) return
      const el = e.currentTarget
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      hoverTimer.current = setTimeout(() => open(item, el), 90)
    },
    onMouseLeave: () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      if (!pinned) setActive(null)
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (!pinned) open(item, e.currentTarget)
    },
    onBlur: () => {
      if (!pinned) setActive(null)
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      if (pinned && active?.item === item) {
        close()
        return
      }
      setActive({ item, rect: el.getBoundingClientRect() })
      setPinned(true)
      fetchSpotlight(item, attempts[item] ?? 0, false)
    },
  })

  const shuffle = () => {
    if (!active) return
    const next = (attempts[active.item] ?? 0) + 1
    setAttempts((prev) => ({ ...prev, [active.item]: next }))
    fetchSpotlight(active.item, next, true)
  }

  const overlay = active ? (
    <SpotlightPopover
      rect={active.rect}
      item={active.item}
      pinned={pinned}
      loading={loading && !cache[active.item]}
      spotlight={cache[active.item]}
      cfg={cfg}
      onShuffle={shuffle}
      onClose={close}
    />
  ) : null

  return { handlers, isActive: (item: string) => active?.item === item, overlay }
}

function SpotlightPopover({
  rect,
  item,
  pinned,
  loading,
  spotlight,
  cfg,
  onShuffle,
  onClose,
}: {
  rect: DOMRect
  item: string
  pinned: boolean
  loading: boolean
  spotlight?: Spotlight
  cfg: SpotlightConfig
  onShuffle: () => void
  onClose: () => void
}): ReactNode {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const width = Math.min(POPOVER_WIDTH, vw - 16)
  const left = Math.min(Math.max(rect.left, 8), vw - width - 8)
  const estHeight = Math.min(cfg.size, 28) * 2 + 150
  const placeBelow = rect.bottom + 8 + estHeight < vh || rect.top < estHeight

  const style: CSSProperties = {
    position: 'fixed',
    left,
    width,
    top: placeBelow ? rect.bottom + 8 : undefined,
    bottom: placeBelow ? undefined : vh - rect.top + 8,
    zIndex: 50,
  }

  const base: CSSProperties = {
    fontFamily: `"${cfg.cssFamily}", system-ui`,
    fontSize: Math.min(cfg.size, 28),
    lineHeight: 1.35,
  }

  return (
    <>
      {pinned && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div
        style={style}
        className="rounded-lg border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
          <code className="font-mono text-[11px] text-neutral-500">{codepoints(item)}</code>
          {pinned && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onShuffle}
                className="text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
              >
                ↻ another word
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <div className="p-2">
          {loading || !spotlight ? (
            <div className="px-2 py-6 text-center text-xs text-neutral-400">picking a word…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800">
                <PopCell label={cfg.before.label} text={spotlight.text} style={{ ...base, ...cfg.before.css }} ranges={spotlight.highlightRanges} />
                <PopCell label={cfg.after.label} text={spotlight.text} style={{ ...base, ...cfg.after.css }} ranges={spotlight.highlightRanges} lang={cfg.after.lang} />
              </div>
              {spotlight.usedCoverage && (
                <div className="mt-1.5 px-1 text-[11px] text-neutral-400 dark:text-neutral-600">
                  no word contains this glyph — shown bare
                </div>
              )}
              {!pinned && (
                <div className="mt-1.5 px-1 text-[11px] text-neutral-400 dark:text-neutral-600">
                  click to pin · pull another word
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function PopCell({
  label,
  text,
  style,
  ranges,
  lang,
}: {
  label: string
  text: string
  style: CSSProperties
  ranges?: [number, number][]
  lang?: string
}) {
  return (
    <div className="bg-white p-3 dark:bg-neutral-950">
      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div style={style} className="break-words text-neutral-900 dark:text-neutral-100" lang={lang}>
        {highlightRanges(text, ranges)}
      </div>
    </div>
  )
}
