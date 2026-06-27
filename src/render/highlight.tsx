import type { ReactNode } from 'react'

/**
 * Wrap the given character ranges (from a HarfBuzz shaping diff — the exact
 * clusters a feature changes) in <mark>. Whether ranges are worth showing is
 * decided upstream (in src/samples); here we just render them.
 */
export function highlightRanges(text: string, ranges?: [number, number][]): ReactNode {
  if (!ranges || ranges.length === 0) return text

  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: ReactNode[] = []
  let pos = 0
  let key = 0

  for (const [rawStart, rawEnd] of sorted) {
    const start = Math.max(rawStart, pos)
    const end = Math.min(Math.max(rawEnd, start), text.length)
    if (start > pos) out.push(text.slice(pos, start))
    if (end > start) {
      out.push(
        <mark key={key++} className="rounded-sm bg-indigo-500/25 text-inherit">
          {text.slice(start, end)}
        </mark>,
      )
    }
    pos = Math.max(pos, end)
  }
  if (pos < text.length) out.push(text.slice(pos))
  return out
}
