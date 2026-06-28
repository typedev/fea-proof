import { useEffect, useState, type CSSProperties } from 'react'
import { beforeAfterSettings, ligatureBeforeAfter } from '../render/featureSettings'
import { classifyScript } from '../samples/pick'
import { buildSpotlight, coveredItems } from '../samples/spotlight'
import type { Shaper } from '../core/shape'
import { useGlyphSpotlight, INTERACTIVE_TILE_CLASS, codepoints } from './GlyphSpotlight'

const SCRIPT_LABELS: Record<string, string> = {
  latn: 'Latin',
  cyrl: 'Cyrillic',
  grek: 'Greek',
  other: 'Other',
}
const SCRIPT_ORDER = ['latn', 'cyrl', 'grek', 'other']
const reLetter = /\p{L}/u

/**
 * Full inventory of a feature's affected glyphs: every input character (single)
 * or component sequence (ligature) shown default → feature-on, grouped by script.
 *
 * Letter tiles of non-numeric features are buttons: hovering (or focusing) pops a
 * spotlight that proofs THAT substitution on a real word; clicking pins it so you
 * can pull a different word. Solves the coverage gap — the inline word can only
 * surface a handful of a large alphabet's forms.
 */
export function AffectedGlyphs({
  cssFamily,
  tag,
  defaultOn,
  affected,
  size = 26,
  isLigature = false,
  settings,
  shaper,
  spotlight = true,
}: {
  cssFamily: string
  tag: string
  defaultOn: boolean
  affected: string[]
  size?: number
  isLigature?: boolean
  settings?: { before: string; after: string }
  shaper?: Shaper
  /** Enable the per-glyph real-word hover spotlight (off for numeric features). */
  spotlight?: boolean
}) {
  const resolved = settings ?? (isLigature ? ligatureBeforeAfter(tag) : beforeAfterSettings(tag, defaultOn))
  const { before, after } = resolved
  const family = `"${cssFamily}", system-ui`
  const glyphSize = Math.min(size, 30)

  const groups = new Map<string, string[]>()
  for (const item of affected) {
    const key = classifyScript(item[0] ?? '') ?? 'other'
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  const orderedGroups = SCRIPT_ORDER.filter((k) => groups.has(k))

  const offStyle: CSSProperties = { fontFamily: family, fontFeatureSettings: before, fontSize: glyphSize }
  const onStyle: CSSProperties = { fontFamily: family, fontFeatureSettings: after, fontSize: glyphSize }

  // Which tiles actually have a real demo word — others stay non-interactive so
  // hovering them doesn't pop a bare "same as the tile" proof. Null = not yet
  // checked (tiles inert until known, so we never flash an active-then-dead tile).
  const [covered, setCovered] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!spotlight) {
      setCovered(null)
      return
    }
    let cancelled = false
    setCovered(null)
    coveredItems(affected, isLigature).then((s) => {
      if (!cancelled) setCovered(s)
    })
    return () => {
      cancelled = true
    }
  }, [affected, isLigature, spotlight])

  const { handlers, isActive, overlay } = useGlyphSpotlight({
    build: (item, attempt) =>
      buildSpotlight(item, {
        isLigature,
        proof: { kind: 'feature', before, after },
        shaper,
        attempt,
      }),
    cssFamily,
    size,
    before: { label: isLigature ? 'no ligatures' : defaultOn ? 'feature off' : 'default', css: { fontFeatureSettings: before } },
    after: { label: isLigature ? tag : defaultOn ? 'default (on)' : 'feature on', css: { fontFeatureSettings: after } },
  })

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
      {orderedGroups.map((key) => (
        <div key={key}>
          {orderedGroups.length > 1 && (
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-500">
              {SCRIPT_LABELS[key]} · {groups.get(key)!.length}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {groups.get(key)!.map((item, i) => {
              const interactive =
                spotlight && reLetter.test(item[0] ?? '') && covered !== null && covered.has(item)
              const inner = (
                <>
                  <span style={offStyle} className="text-neutral-400 dark:text-neutral-600">
                    {item}
                  </span>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-600">→</span>
                  <span style={onStyle} className="text-neutral-900 dark:text-neutral-100">
                    {item}
                  </span>
                </>
              )
              if (!interactive) {
                return (
                  <div
                    key={`${item}-${i}`}
                    className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
                    title={codepoints(item)}
                  >
                    {inner}
                  </div>
                )
              }
              return (
                <button
                  type="button"
                  key={`${item}-${i}`}
                  {...handlers(item)}
                  className={`flex items-center gap-1 rounded-md border bg-white px-2 py-1 dark:bg-neutral-900 ${INTERACTIVE_TILE_CLASS} ${
                    isActive(item)
                      ? 'border-indigo-400 dark:border-indigo-500'
                      : 'border-neutral-200 hover:border-indigo-300 dark:border-neutral-800 dark:hover:border-indigo-700'
                  }`}
                  title={codepoints(item)}
                >
                  {inner}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {overlay}
    </div>
  )
}
