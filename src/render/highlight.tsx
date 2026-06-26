import type { ReactNode } from 'react'

/**
 * Wrap occurrences of `needles` (the feature's affected characters / ligature
 * sequences) in the text so the reader can spot exactly what the feature acts
 * on. Case-insensitive; longer needles match first (so ligature sequences win
 * over single chars).
 */
export function highlightText(text: string, needles?: string[]): ReactNode {
  const list = [...new Set((needles ?? []).filter(Boolean).map((n) => n.toLowerCase()))].sort(
    (a, b) => b.length - a.length,
  )
  if (list.length === 0) return text

  // Whether highlighting is worthwhile is decided upstream (per feature, in
  // src/samples) — here we just mark the needles we're given.
  const lower = text.toLowerCase()
  const out: ReactNode[] = []
  let plain = ''
  let i = 0
  let key = 0

  while (i < text.length) {
    const needle = list.find((n) => lower.startsWith(n, i))
    if (needle) {
      if (plain) {
        out.push(plain)
        plain = ''
      }
      out.push(
        <mark key={key++} className="rounded-sm bg-indigo-500/25 text-inherit">
          {text.slice(i, i + needle.length)}
        </mark>,
      )
      i += needle.length
    } else {
      plain += text[i]
      i += 1
    }
  }
  if (plain) out.push(plain)
  return out
}
