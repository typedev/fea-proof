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

  const lower = text.toLowerCase()

  // Highlighting only helps when the substituted glyphs stand out among
  // unaffected ones. If almost everything in the sample is affected (e.g. small
  // caps over an all-letters phrase), the change is already obvious — skip it.
  const nonSpace = text.replace(/\s/g, '').length
  let affected = 0
  for (let p = 0; p < text.length; ) {
    const hit = list.find((n) => lower.startsWith(n, p))
    if (hit) {
      affected += hit.length
      p += hit.length
    } else {
      p += 1
    }
  }
  if (nonSpace === 0 || affected / nonSpace > 0.6) return text
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
