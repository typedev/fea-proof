import { useState, type ReactNode } from 'react'
import type { FeatureInfo } from '../core/types'
import type { FeatureSample } from '../samples'
import type { Shaper } from '../core/shape'
import { Preview } from '../render/Preview'
import { LoclPreview } from '../render/LoclPreview'
import { AffectedGlyphs } from './AffectedGlyphs'
import { ContextualExamples } from './ContextualExamples'
import { AltGrid } from './AltGrid'
import { FeatureVariationsGroups } from './FeatureVariationsGroups'
import { useFeatureVariations } from '../render/featureVariationsContext'
import { ligatureBeforeAfter, isFigureLikeFeature, isCaseFeature } from '../render/featureSettings'

// Above this many affected glyphs the word sample can't show them all, so offer
// the full inventory.
const GLYPH_INVENTORY_THRESHOLD = 12

/** DOM id for a feature card, used as a scroll anchor by the feature navigator. */
export function featureAnchorId(feature: Pick<FeatureInfo, 'tag' | 'tables'>): string {
  return `feat-${feature.tag}-${feature.tables.join('')}`.replace(/[^a-z0-9-]/gi, '')
}

const SCRIPT_LABELS: Record<string, string> = {
  latn: 'Latin',
  cyrl: 'Cyrillic',
  grek: 'Greek',
  DFLT: 'Default',
}

const LOOKUP_KIND: Record<number, string> = {
  1: 'single',
  2: 'multiple',
  3: 'alternate',
  4: 'ligature',
  5: 'context',
  6: 'chaining',
  8: 'reverse',
}

type Tone = 'neutral' | 'on' | 'off' | 'muted'

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
    on: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    off: 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
    muted:
      'border border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500',
  }
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

export function FeatureCard({
  feature,
  sample,
  cssFamily,
  size = 30,
  shaper,
  onOpenMarkExplorer,
}: {
  feature: FeatureInfo
  sample?: FeatureSample
  cssFamily: string
  size?: number
  shaper?: Shaper
  onOpenMarkExplorer?: (feature: FeatureInfo) => void
}) {
  const isMarkFeature = feature.tag === 'mark' || feature.tag === 'mkmk'
  const kinds = feature.gsubLookupTypes.map((t) => LOOKUP_KIND[t] ?? `type ${t}`)
  const [showAll, setShowAll] = useState(false)
  const fv = useFeatureVariations()
  const fvGroups = fv?.groupsByTag.get(feature.tag)
  const hasFvGroups = !!fvGroups && fvGroups.length > 0

  return (
    <div
      id={featureAnchorId(feature)}
      style={{ scrollMarginTop: 'var(--scroll-offset, 1rem)' }}
      className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <code className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm text-indigo-600 dark:bg-neutral-800 dark:text-indigo-300">
            {feature.tag}
          </code>
          <div className="min-w-0">
            <div className="text-sm text-neutral-800 dark:text-neutral-200">{feature.name}</div>
            {(feature.scripts.length > 0 || feature.langs.length > 0) && (
              <div className="mt-0.5 text-xs text-neutral-500">
                {feature.scripts.map((s) => SCRIPT_LABELS[s] ?? s).join(', ')}
                {feature.langs.length > 0 && (
                  <span className="text-neutral-400 dark:text-neutral-600"> · langs: {feature.langs.join(', ')}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {kinds.map((k) => (
            <Badge key={k} tone="muted">
              {k}
            </Badge>
          ))}
          {feature.ignored ? (
            <Badge tone="off">ignored</Badge>
          ) : (
            <Badge tone={feature.defaultOn ? 'on' : 'off'}>
              {feature.defaultOn ? 'default on' : 'default off'}
            </Badge>
          )}
          {feature.tables.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </div>

      {sample ? (
        sample.kind === 'locl' ? (
        <div className="mt-3">
          <LoclPreview cssFamily={cssFamily} languages={sample.languages} size={size} shaper={shaper} />
        </div>
      ) : sample.kind === 'alternates' ? (
        <div className="mt-3">
          <AltGrid cssFamily={cssFamily} tag={feature.tag} alternates={sample.alternates} size={size} />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {sample.seeCombinations && sample.note && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
              {sample.note}{' '}
              <button
                onClick={() =>
                  document.getElementById('feature-combinations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Jump →
              </button>
            </div>
          )}
          {sample.text && (
            <div>
              <Preview
                cssFamily={cssFamily}
                text={sample.text}
                tag={feature.tag}
                defaultOn={feature.defaultOn}
                size={size}
                highlightRanges={sample.highlightRanges}
                isolate={sample.isolate}
                settings={sample.kind === 'ligature' ? ligatureBeforeAfter(feature.tag) : sample.settings}
                labels={
                  sample.kind === 'ligature'
                    ? { before: 'no ligatures', after: feature.tag }
                    : sample.labels
                }
              />
              {sample.usedCoverage && (
                <div className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-600">
                  {sample.kind === 'ligature'
                    ? 'component sequences (no word contains them)'
                    : 'covered glyphs (no readable word contains them)'}
                </div>
              )}
              {sample.note && (
                <div className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-600">{sample.note}</div>
              )}
              {sample.affected.length > GLYPH_INVENTORY_THRESHOLD && (
                <>
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    className="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {showAll ? 'Hide' : `Show all ${sample.affected.length} affected glyphs`}
                  </button>
                  {showAll && (
                    <AffectedGlyphs
                      cssFamily={cssFamily}
                      tag={feature.tag}
                      defaultOn={feature.defaultOn}
                      affected={sample.affected}
                      size={size}
                      isLigature={sample.kind === 'ligature'}
                      settings={sample.settings}
                      shaper={shaper}
                      spotlight={!isFigureLikeFeature(feature.tag) && !isCaseFeature(feature.tag)}
                    />
                  )}
                </>
              )}
            </div>
          )}
          {sample.examples && sample.examples.length > 0 && (
            <ContextualExamples
              cssFamily={cssFamily}
              tag={feature.tag}
              defaultOn={feature.defaultOn}
              examples={sample.examples}
              size={size}
            />
          )}
        </div>
        )
      ) : hasFvGroups ? null : isMarkFeature && onOpenMarkExplorer ? (
        <button
          onClick={() => onOpenMarkExplorer(feature)}
          className="mt-3 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Open mark explorer →
        </button>
      ) : (
        <div className="mt-3 text-xs text-neutral-400 dark:text-neutral-600">{noPreviewReason(feature)}</div>
      )}
      {fv && hasFvGroups && (
        <div className="mt-3">
          <FeatureVariationsGroups
            font={fv.font}
            axes={fv.axes}
            avar={fv.avar}
            groups={fvGroups}
            size={size}
            applyByLookup={fv.applyByLookup}
            onApply={fv.onApply}
          />
        </div>
      )}
    </div>
  )
}

function noPreviewReason(feature: FeatureInfo): string {
  if (feature.ignored) return 'ignored feature'
  if (!feature.tables.includes('GSUB')) return 'positioning feature — no glyph substitution to preview'
  if (feature.tag === 'aalt') return 'access all alternates — no alternates found'
  if (feature.tag === 'ccmp') return 'glyph composition/decomposition — usually invisible'
  if (feature.gsubLookupTypes.some((t) => t === 5 || t === 6))
    return 'contextual feature — no text trigger found'
  return 'no single-substitution preview available'
}
