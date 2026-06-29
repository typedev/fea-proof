import type { CSSProperties } from 'react'
import { beforeAfterSettings, LIGATURES_OFF } from './featureSettings'
import { highlightRanges, type SegmentSettings } from './highlight'
import { useVariationSettings } from './variationContext'

interface PreviewProps {
  cssFamily: string
  text: string
  tag: string
  defaultOn: boolean
  size?: number
  /** BCP-47 lang for the "after" side (used by locl). */
  lang?: string
  /** Label override for the two sides. */
  labels?: { before: string; after: string }
  /** Character ranges to highlight (from shaping diff). */
  highlightRanges?: [number, number][]
  /** Precomputed font-feature-settings override (e.g. ligature isolation). */
  settings?: { before: string; after: string }
  /** Render each token as an isolated shaping run (figure/ordinal samples only). */
  isolate?: boolean
}

export function Preview({ cssFamily, text, tag, defaultOn, size = 30, lang, labels, highlightRanges: ranges, settings, isolate }: PreviewProps) {
  const { before, after } = settings ?? beforeAfterSettings(tag, defaultOn)
  const fontVariationSettings = useVariationSettings()
  const base: CSSProperties = {
    fontFamily: `"${cssFamily}", system-ui`,
    fontSize: size,
    lineHeight: 1.35,
    fontVariationSettings,
  }
  const defaultLabels = defaultOn
    ? { before: 'feature off', after: 'default (on)' }
    : { before: 'default', after: 'feature on' }
  const finalLabels = labels ?? defaultLabels

  // Isolate the highlighted target in the "after" cell so a greedy/longer ligature
  // can't absorb it (ligatures run before ssXX/cvXX). Skip for figure/ordinal
  // samples (isolate) — they already isolate per token — and when nothing is marked.
  const afterSegments: SegmentSettings | undefined =
    ranges && ranges.length && !isolate ? { plain: LIGATURES_OFF, target: after } : undefined

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800">
      <Cell label={finalLabels.before} text={text} ranges={ranges} isolate={isolate} style={{ ...base, fontFeatureSettings: before }} />
      <Cell label={finalLabels.after} text={text} ranges={ranges} isolate={isolate} segments={afterSegments} style={{ ...base, fontFeatureSettings: after }} lang={lang} />
    </div>
  )
}

function Cell({
  label,
  text,
  style,
  lang,
  ranges,
  isolate,
  segments,
}: {
  label: string
  text: string
  style: CSSProperties
  lang?: string
  ranges?: [number, number][]
  isolate?: boolean
  segments?: SegmentSettings
}) {
  return (
    <div className="bg-white p-4 dark:bg-neutral-950">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div style={style} className="break-words text-neutral-900 dark:text-neutral-100" lang={lang}>
        {highlightRanges(text, ranges, isolate, segments)}
      </div>
    </div>
  )
}
