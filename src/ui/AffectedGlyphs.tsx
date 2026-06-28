import { useEffect, useState, type CSSProperties } from 'react'
import { beforeAfterSettings, ligatureBeforeAfter } from '../render/featureSettings'
import { classifyScript } from '../samples/pick'
import { inlineSamples, type InlineSample } from '../samples/spotlight'
import { highlightRanges } from '../render/highlight'
import type { Shaper } from '../core/shape'

const SCRIPT_LABELS: Record<string, string> = {
  latn: 'Latin',
  cyrl: 'Cyrillic',
  grek: 'Greek',
  other: 'Other',
}
const SCRIPT_ORDER = ['latn', 'cyrl', 'grek', 'other']

/** "U+0041 U+0041" — hover title for a glyph / sequence tile. */
export function codepoints(item: string): string {
  return [...item].map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')
}

/**
 * Full inventory of a feature's affected glyphs: every input character (single)
 * or component sequence (ligature) shown default → feature-on, and — when a real
 * word contains it — that word rendered with the feature applied (the glyph
 * highlighted), so you see the substitution in living text. Tiles with no word
 * just show the pair. Words are skipped entirely for numeric features (spotlight
 * off), which proof on templates instead.
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
  /** Show inline demo words (off for numeric / case features). */
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

  // Lazily pick a demo word per affected item once the grid is shown.
  const [words, setWords] = useState<Map<string, InlineSample | null> | null>(null)
  useEffect(() => {
    if (!spotlight) {
      setWords(null)
      return
    }
    let cancelled = false
    setWords(null)
    inlineSamples(affected, isLigature, { kind: 'feature', before, after }, shaper).then((m) => {
      if (!cancelled) setWords(m)
    })
    return () => {
      cancelled = true
    }
  }, [affected, isLigature, spotlight, before, after, shaper])

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
              const sample = words?.get(item)
              return (
                <div
                  key={`${item}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
                  title={codepoints(item)}
                >
                  <span className="flex items-center gap-1">
                    <span style={offStyle} className="text-neutral-400 dark:text-neutral-600">
                      {item}
                    </span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-600">→</span>
                    <span style={onStyle} className="text-neutral-900 dark:text-neutral-100">
                      {item}
                    </span>
                  </span>
                  {sample && (
                    <span
                      style={onStyle}
                      className="border-l border-neutral-200 pl-2 text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
                    >
                      {highlightRanges(sample.text, sample.ranges)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
