import type { CSSProperties } from 'react'
import type { LoclLanguageSample } from '../samples'
import { highlightText } from './highlight'

export function LoclPreview({
  cssFamily,
  languages,
  size = 28,
  overrideText,
}: {
  cssFamily: string
  languages: LoclLanguageSample[]
  size?: number
  overrideText?: string
}) {
  const base: CSSProperties = { fontFamily: `"${cssFamily}", system-ui`, fontSize: size, lineHeight: 1.4 }

  return (
    <div className="space-y-2">
      {languages.map((l) => {
        // font-language-override takes the OT language system tag directly — the
        // robust way to force a localized form without relying on lang mapping.
        const localized = { ...base, fontLanguageOverride: `"${l.otTag.trim()}"` } as CSSProperties
        const text = overrideText || l.text
        return (
          <div key={l.otTag} className="overflow-hidden rounded-lg border border-neutral-800">
            <div className="flex items-center gap-2 bg-neutral-900/60 px-3 py-1.5 text-xs">
              <span className="text-neutral-300">{l.name}</span>
              <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px] text-indigo-300">
                {l.otTag.trim()}
              </code>
              {l.usedCoverage && <span className="text-neutral-600">covered glyphs</span>}
            </div>
            <div className="grid grid-cols-2 gap-px bg-neutral-800">
              <Cell label="default" text={text} style={base} highlight={l.highlight} />
              <Cell label={l.name} text={text} style={localized} lang={l.bcp47} highlight={l.highlight} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Cell({
  label,
  text,
  style,
  lang,
  highlight,
}: {
  label: string
  text: string
  style: CSSProperties
  lang?: string
  highlight?: string[]
}) {
  return (
    <div className="bg-neutral-950 p-3">
      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div style={style} className="break-words text-neutral-100" lang={lang}>
        {highlightText(text, highlight)}
      </div>
    </div>
  )
}
