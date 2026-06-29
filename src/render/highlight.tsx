import type { CSSProperties, ReactNode } from 'react'

/** Per-segment `font-feature-settings` for isolating a highlighted target. */
export interface SegmentSettings {
  /** Applied AROUND the target (ligatures off, so nothing absorbs it). */
  plain: string
  /** Applied ON the target (its own feature), in its own shaping run. */
  target: string
}

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
 * shaping run. Use it ONLY for self-contained tokens (figure/ordinal samples).
 *
 * `segments` gives the highlighted target its OWN `font-feature-settings` (its
 * feature) and the surrounding text ligatures-off, each as a separate inline run.
 * This stops a greedy/longer ligature from swallowing the target so the demo shows
 * exactly the substitution it claims to (e.g. the `AA` ligature, not `MA`+`AR`).
 */
export function highlightRanges(
  text: string,
  ranges?: [number, number][],
  isolate = false,
  segments?: SegmentSettings,
): ReactNode {
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
          {renderMarks(text, i, j, sorted, key, segments)}
        </span>,
      )
    } else {
      nodes.push(<span key={key.n++}>{renderMarks(text, i, j, sorted, key, segments)}</span>)
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
  segments?: SegmentSettings,
): ReactNode {
  const plainStyle: CSSProperties | undefined = segments ? { fontFeatureSettings: segments.plain } : undefined
  const targetStyle: CSSProperties | undefined = segments ? { fontFeatureSettings: segments.target } : undefined
  // Around-the-target text: a styled span (its own ligatures-off run) when
  // isolating, otherwise a bare string.
  const plain = (s: string): ReactNode =>
    segments ? (
      <span key={key.n++} style={plainStyle}>
        {s}
      </span>
    ) : (
      s
    )

  if (sorted.length === 0) return plain(text.slice(start, end))
  const out: ReactNode[] = []
  let pos = start
  for (const [rs, re] of sorted) {
    const s = Math.max(rs, pos)
    const e = Math.min(re, end)
    if (e <= s) continue
    if (s >= end) break
    if (s > pos) out.push(plain(text.slice(pos, s)))
    out.push(
      <mark key={key.n++} style={targetStyle} className="rounded-sm bg-indigo-500/25 text-inherit">
        {text.slice(s, e)}
      </mark>,
    )
    pos = e
  }
  if (out.length === 0) return plain(text.slice(start, end))
  if (pos < end) out.push(plain(text.slice(pos, end)))
  return out
}
