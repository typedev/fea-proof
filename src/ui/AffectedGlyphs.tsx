import { useEffect, useState, type CSSProperties } from 'react'
import { beforeAfterSettings, ligatureBeforeAfter, positionalRole, LIGATURES_OFF } from '../render/featureSettings'
import { classifyScript } from '../samples/pick'
import { inlineSamples, type InlineSample } from '../samples/spotlight'
import { highlightRanges } from '../render/highlight'
import { useVariationSettings } from '../render/variationContext'
import { useSupportedCodepoints } from '../render/supportedCodepointsContext'
import { useGlyphInfo } from '../render/glyphInfoContext'
import { popoverSize, shapeData, useGlyphPopover, type PopoverContent } from './GlyphInfoPopover'
import { cssToHbFeatures } from '../samples/spotlight'
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

  const fontVariationSettings = useVariationSettings()
  const supportedCps = useSupportedCodepoints()
  const info = useGlyphInfo()
  const pop = useGlyphPopover()
  const offStyle: CSSProperties = { fontFamily: family, fontFeatureSettings: before, fontSize: glyphSize, fontVariationSettings }
  const onStyle: CSSProperties = { fontFamily: family, fontFeatureSettings: after, fontSize: glyphSize, fontVariationSettings }
  // Popover preview renders larger than the size regulator (uncapped, unlike the tiles).
  const bigOff: CSSProperties = { ...offStyle, fontSize: popoverSize(size) }
  const bigOn: CSSProperties = { ...onStyle, fontSize: popoverSize(size) }

  // Lazily pick a demo word per affected item once the grid is shown.
  const [words, setWords] = useState<Map<string, InlineSample | null> | null>(null)
  useEffect(() => {
    if (!spotlight) {
      setWords(null)
      return
    }
    let cancelled = false
    setWords(null)
    inlineSamples(affected, isLigature, { kind: 'feature', before, after }, shaper, positionalRole(tag), supportedCps).then((m) => {
      if (!cancelled) setWords(m)
    })
    return () => {
      cancelled = true
    }
  }, [affected, isLigature, spotlight, before, after, shaper, tag, supportedCps])

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
              const tileKey = `${key}-${item}-${i}`
              const build = (): PopoverContent => ({
                preview: (
                  <>
                    <span style={bigOff} className="leading-none text-neutral-400 dark:text-neutral-600">
                      {item}
                    </span>
                    <span className="text-sm text-neutral-400 dark:text-neutral-600">→</span>
                    <span style={bigOn} className="leading-none text-neutral-900 dark:text-neutral-100">
                      {item}
                    </span>
                  </>
                ),
                word: sample ? (
                  <span style={bigOn} className="text-neutral-700 dark:text-neutral-300">
                    {highlightRanges(sample.text, sample.ranges, false, { plain: LIGATURES_OFF, target: after })}
                  </span>
                ) : undefined,
                columns: [
                  { label: 'default', glyphs: shapeData(shaper, info, item, { features: cssToHbFeatures(before) }) },
                  { label: 'feature on', glyphs: shapeData(shaper, info, item, { features: cssToHbFeatures(after) }) },
                ],
                baseline: true,
              })
              return (
                <div
                  key={`${item}-${i}`}
                  {...pop.tileProps(tileKey, build)}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 outline-none hover:border-neutral-300 focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
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
                      {highlightRanges(sample.text, sample.ranges, false, { plain: LIGATURES_OFF, target: after })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {pop.node}
    </div>
  )
}
