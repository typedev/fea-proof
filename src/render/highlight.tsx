import type { ReactNode } from 'react'

/**
 * Render sample text, wrapping the given character ranges (from a HarfBuzz shaping
 * diff — the exact clusters a feature changes) in <mark>. Whether ranges are worth
 * showing is decided upstream (in src/samples); here we just render them.
 *
 * Each whitespace-delimited token is wrapped in a `white-space: nowrap` span so a
 * ligature/sequence (e.g. `-->`, `5th`) never breaks across a line — a wrap inside
 * a token would split the cluster and the ligature wouldn't form (worst at large
 * sizes). Line breaks still happen at the spaces BETWEEN tokens.
 *
 * `isolate` additionally makes each token an `inline-block`, giving it its own
 * shaping run. Use it ONLY for self-contained tokens (figure/ordinal samples):
 * it stops a script-neutral digit from inheriting a neighbour token's script
 * (mixed Latin/Cyrillic ordinals like `4th` next to `4й` would otherwise not
 * ligate), but it also severs cross-space context, so it must NOT be used where a
 * proof depends on it (contextual / positional / swash-final words).
 */
export function highlightRanges(text: string, ranges?: [number, number][], isolate = false): ReactNode {
  if (text.length === 0) return text
  const sorted = ranges && ranges.length ? [...ranges].sort((a, b) => a[0] - b[0]) : []
  const tokenClass = isolate ? 'inline-block whitespace-nowrap align-baseline' : 'whitespace-nowrap'
  // Only multi-token samples get per-token nowrap. A sample with no internal
  // whitespace is a single token (case strings like `H-H–H`, coverage strings):
  // trapping it in a nowrap box would make it overflow instead of wrap, and it has
  // no cross-line ligature to protect. Render it plainly so the container can wrap.
  const multiToken = /\s/.test(text.trim())
  const nodes: ReactNode[] = []
  const key = { n: 0 }

  let i = 0
  while (i < text.length) {
    const isSpace = /\s/.test(text[i])
    let j = i + 1
    while (j < text.length && /\s/.test(text[j]) === isSpace) j++
    if (isSpace) {
      nodes.push(text.slice(i, j))
    } else if (multiToken) {
      nodes.push(
        <span key={key.n++} className={tokenClass}>
          {renderMarks(text, i, j, sorted, key)}
        </span>,
      )
    } else {
      nodes.push(<span key={key.n++}>{renderMarks(text, i, j, sorted, key)}</span>)
    }
    i = j
  }
  return nodes
}

/** Render text[start,end) with any overlapping ranges wrapped in <mark>. */
function renderMarks(
  text: string,
  start: number,
  end: number,
  sorted: [number, number][],
  key: { n: number },
): ReactNode {
  if (sorted.length === 0) return text.slice(start, end)
  const out: ReactNode[] = []
  let pos = start
  for (const [rs, re] of sorted) {
    const s = Math.max(rs, pos)
    const e = Math.min(re, end)
    if (e <= s) continue
    if (s >= end) break
    if (s > pos) out.push(text.slice(pos, s))
    out.push(
      <mark key={key.n++} className="rounded-sm bg-indigo-500/25 text-inherit">
        {text.slice(s, e)}
      </mark>,
    )
    pos = e
  }
  if (out.length === 0) return text.slice(start, end)
  if (pos < end) out.push(text.slice(pos, end))
  return out
}
