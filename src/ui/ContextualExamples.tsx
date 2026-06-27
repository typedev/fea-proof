import { useState } from 'react'
import type { ContextualExample } from '../samples'
import { Preview } from '../render/Preview'

const INITIAL = 6

/** List of contextual substitution examples (one per derived trigger). */
export function ContextualExamples({
  cssFamily,
  tag,
  defaultOn,
  examples,
  size = 30,
}: {
  cssFamily: string
  tag: string
  defaultOn: boolean
  examples: ContextualExample[]
  size: number
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? examples : examples.slice(0, INITIAL)

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        {examples.length} contextual {examples.length === 1 ? 'substitution' : 'substitutions'}
      </div>
      {shown.map((ex, i) => (
        <Preview
          key={i}
          cssFamily={cssFamily}
          text={ex.text}
          tag={tag}
          defaultOn={defaultOn}
          size={size}
          settings={ex.settings}
          highlightRanges={ex.highlightRanges}
          labels={{ before: 'off', after: tag }}
        />
      ))}
      {examples.length > INITIAL && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAll ? 'Show fewer' : `Show all ${examples.length}`}
        </button>
      )}
    </div>
  )
}
