import type { CSSProperties } from 'react'
import type { LoclLanguageSample } from '../samples'
import { highlightRanges } from './highlight'

export function LoclPreview({
  cssFamily,
  languages,
  size = 28,
}: {
  cssFamily: string
  languages: LoclLanguageSample[]
  size?: number
}) {
  const base: CSSProperties = { fontFamily: `"${cssFamily}", system-ui`, fontSize: size, lineHeight: 1.4 }

  return (
    <div className="space-y-2">
      {languages.map((l) => {
        // font-language-override takes the OT language system tag directly — the
        // robust way to force a localized form without relying on lang mapping.
        const localized = { ...base, fontLanguageOverride: `"${l.otTag.trim()}"` } as CSSProperties
        return (
          <div
            key={l.otTag}
            className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 text-xs dark:bg-neutral-900/60">
              <span className="text-neutral-600 dark:text-neutral-300">{l.name}</span>
              <code className="rounded bg-neutral-200 px-1 py-0.5 font-mono text-[11px] text-indigo-600 dark:bg-neutral-800 dark:text-indigo-300">
                {l.otTag.trim()}
              </code>
              {l.usedCoverage && <span className="text-neutral-400 dark:text-neutral-600">covered glyphs</span>}
            </div>
            <div className="grid grid-cols-2 gap-px bg-neutral-200 dark:bg-neutral-800">
              <Cell label="default" text={l.text} style={base} ranges={l.highlightRanges} />
              <Cell label={l.name} text={l.text} style={localized} lang={l.bcp47} ranges={l.highlightRanges} />
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
  ranges,
}: {
  label: string
  text: string
  style: CSSProperties
  lang?: string
  ranges?: [number, number][]
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
