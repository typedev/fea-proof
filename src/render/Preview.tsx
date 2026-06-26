import type { CSSProperties } from 'react'
import { beforeAfterSettings } from './featureSettings'

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
}

export function Preview({ cssFamily, text, tag, defaultOn, size = 30, lang, labels }: PreviewProps) {
  const { before, after } = beforeAfterSettings(tag, defaultOn)
  const base: CSSProperties = { fontFamily: `"${cssFamily}", system-ui`, fontSize: size, lineHeight: 1.35 }
  const defaultLabels = defaultOn
    ? { before: 'feature off', after: 'default (on)' }
    : { before: 'default', after: 'feature on' }
  const finalLabels = labels ?? defaultLabels

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-neutral-800">
      <Cell label={finalLabels.before} text={text} style={{ ...base, fontFeatureSettings: before }} />
      <Cell label={finalLabels.after} text={text} style={{ ...base, fontFeatureSettings: after }} lang={lang} />
    </div>
  )
}

function Cell({
  label,
  text,
  style,
  lang,
}: {
  label: string
  text: string
  style: CSSProperties
  lang?: string
}) {
  return (
    <div className="bg-neutral-950 p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div style={style} className="break-words text-neutral-100" lang={lang}>
        {text}
      </div>
    </div>
  )
}
