import type { CSSProperties } from 'react'
import { beforeAfterSettings } from '../render/featureSettings'
import { classifyScript } from '../samples/pick'

const SCRIPT_LABELS: Record<string, string> = {
  latn: 'Latin',
  cyrl: 'Cyrillic',
  grek: 'Greek',
  other: 'Other',
}
const SCRIPT_ORDER = ['latn', 'cyrl', 'grek', 'other']

/**
 * Full inventory of a feature's affected glyphs: every input character (single)
 * or component sequence (ligature) shown default → feature-on, grouped by script.
 */
export function AffectedGlyphs({
  cssFamily,
  tag,
  defaultOn,
  affected,
  size = 26,
}: {
  cssFamily: string
  tag: string
  defaultOn: boolean
  affected: string[]
  size?: number
}) {
  const { before, after } = beforeAfterSettings(tag, defaultOn)
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
            {groups.get(key)!.map((item, i) => (
              <div
                key={`${item}-${i}`}
                className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
                title={[...item].map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')}
              >
                <span style={offStyle} className="text-neutral-400 dark:text-neutral-600">
                  {item}
                </span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600">→</span>
                <span style={onStyle} className="text-neutral-900 dark:text-neutral-100">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
