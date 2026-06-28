import { useEffect, useState, type CSSProperties } from 'react'
import type { LoclLanguageSample } from '../samples'
import type { Shaper } from '../core/shape'
import { inlineSamples, type InlineSample } from '../samples/spotlight'
import { highlightRanges } from './highlight'
import { codepoints } from '../ui/AffectedGlyphs'

// Above this many localized forms, collapse the inventory behind a toggle.
const INVENTORY_THRESHOLD = 12

export function LoclPreview({
  cssFamily,
  languages,
  size = 28,
  shaper,
}: {
  cssFamily: string
  languages: LoclLanguageSample[]
  size?: number
  shaper?: Shaper
}) {
  const base: CSSProperties = { fontFamily: `"${cssFamily}", system-ui`, fontSize: size, lineHeight: 1.4 }

  return (
    <div className="space-y-2">
      {languages.map((l) => (
        <LangBlock key={l.otTag} lang={l} base={base} cssFamily={cssFamily} size={size} shaper={shaper} />
      ))}
    </div>
  )
}

function LangBlock({
  lang: l,
  base,
  cssFamily,
  size,
  shaper,
}: {
  lang: LoclLanguageSample
  base: CSSProperties
  cssFamily: string
  size: number
  shaper?: Shaper
}) {
  const [showAll, setShowAll] = useState(false)
  // font-language-override takes the OT language system tag directly — the
  // robust way to force a localized form without relying on lang mapping.
  const localized = { ...base, fontLanguageOverride: `"${l.otTag.trim()}"` } as CSSProperties

  // The picked word only covers a few of the localized forms; show the complete
  // inventory too. Coverage-string samples already list every form, so skip it
  // there to avoid duplicating the cells above.
  const showInventory = !l.usedCoverage && l.affected.length > 0
  const collapsible = l.affected.length > INVENTORY_THRESHOLD

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 text-xs dark:bg-neutral-900/60">
        <span className="text-neutral-600 dark:text-neutral-300">{l.name}</span>
        <code className="rounded bg-neutral-200 px-1 py-0.5 font-mono text-[11px] text-indigo-600 dark:bg-neutral-800 dark:text-indigo-300">
          {l.otTag.trim()}
        </code>
        {l.usedCoverage && <span className="text-neutral-400 dark:text-neutral-600">covered glyphs</span>}
        {showInventory && (
          <span className="ml-auto text-neutral-400 dark:text-neutral-600">
            {l.affected.length} localized {l.affected.length === 1 ? 'form' : 'forms'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px bg-neutral-200 dark:bg-neutral-800">
        <Cell label="default" text={l.text} style={base} ranges={l.highlightRanges} />
        <Cell label={l.name} text={l.text} style={localized} lang={l.bcp47} ranges={l.highlightRanges} />
      </div>
      {showInventory && (
        <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-950/50">
          {collapsible && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mb-2 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {showAll ? 'Hide localized forms' : `Show all ${l.affected.length} localized forms`}
            </button>
          )}
          {(!collapsible || showAll) && (
            <Inventory lang={l} base={base} localized={localized} cssFamily={cssFamily} size={size} shaper={shaper} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Every localized input char shown default → localized form, plus — when a real
 * word contains it — that word rendered localized (font-language-override) with
 * the char highlighted, so you see the localized form in living text.
 */
function Inventory({
  lang: l,
  base,
  localized,
  cssFamily,
  size,
  shaper,
}: {
  lang: LoclLanguageSample
  base: CSSProperties
  localized: CSSProperties
  cssFamily: string
  size: number
  shaper?: Shaper
}) {
  const glyphSize = Math.min(size, 30)
  const off: CSSProperties = { ...base, fontFamily: `"${cssFamily}", system-ui`, fontSize: glyphSize }
  const on: CSSProperties = { ...localized, fontFamily: `"${cssFamily}", system-ui`, fontSize: glyphSize }

  const [words, setWords] = useState<Map<string, InlineSample | null> | null>(null)
  useEffect(() => {
    let cancelled = false
    setWords(null)
    inlineSamples(l.affected, false, { kind: 'locl', bcp47: l.bcp47 }, shaper).then((m) => {
      if (!cancelled) setWords(m)
    })
    return () => {
      cancelled = true
    }
  }, [l.affected, l.bcp47, shaper])

  return (
    <div className="flex flex-wrap gap-1.5">
      {l.affected.map((ch, i) => {
        const sample = words?.get(ch)
        return (
          <div
            key={`${ch}-${i}`}
            className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900"
            title={codepoints(ch)}
          >
            <span className="flex items-center gap-1">
              <span style={off} className="text-neutral-400 dark:text-neutral-600">
                {ch}
              </span>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-600">→</span>
              <span style={on} className="text-neutral-900 dark:text-neutral-100" lang={l.bcp47}>
                {ch}
              </span>
            </span>
            {sample && (
              <span
                style={on}
                lang={l.bcp47}
                className="border-l border-neutral-200 pl-2 text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
              >
                {highlightRanges(sample.text, sample.ranges)}
              </span>
            )}
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
