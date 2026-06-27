import type { Font } from 'opentype.js'
import type { FeatureInfo } from '../core/types'
import { buildReverseCmap, coverageGlyphs, resolveLookup } from '../core/glyphs'
import { affectedInputChars, inputCharsForLookups, inputGlyphsForLookups } from '../core/features/single'
import { reconstructLigatures } from '../core/features/ligature'
import { changedRanges, type Shaper, type ShapeVariant } from '../core/shape'
import { buildSubstGraph, resolveGlyph } from '../core/substitution'
import { deriveTriggers } from '../core/context'
import { beforeAfterFeatures, ligatureFeatures } from '../render/featureSettings'
import { classifyScript, pickSample, pickLigatureSample } from './pick'
import { LANGUAGES, loadWordlist, loadWordBank, type LanguageInfo, type Script } from './languages'

export type HighlightRanges = [number, number][]

export interface ContextualExample {
  text: string
  settings: { before: string; after: string }
  highlightRanges?: HighlightRanges
}

export interface LoclLanguageSample {
  otTag: string
  name: string
  /** BCP-47 tag for the lang attribute, if known. */
  bcp47?: string
  text: string
  usedCoverage: boolean
  /** Character ranges that actually changed (from HarfBuzz diff). */
  highlightRanges?: HighlightRanges
}

export type FeatureSample =
  | {
      tag: string
      kind: 'single' | 'ligature'
      text: string
      usedCoverage: boolean
      /** Character ranges that actually changed (from HarfBuzz diff). */
      highlightRanges?: HighlightRanges
      /** Full set of affected chars (single) / sequences (ligature) for the inventory. */
      affected: string[]
      /** Explicit CSS font-feature-settings override (ligature isolation / contextual). */
      settings?: { before: string; after: string }
      /** Contextual substitution examples (one per derived trigger). */
      examples?: ContextualExample[]
    }
  | { tag: string; kind: 'locl'; languages: LoclLanguageSample[] }
  | { tag: string; kind: 'alternates'; alternates: { char: string; indices: number[] }[] }

// Handled specially (locl, case, aalt) or intentionally not proofed here:
//  - ccmp: glyph composition/decomposition, usually invisible
const SKIP = new Set(['ccmp'])

const NOT_DISPLAYABLE = /[\p{M}\p{Cf}\p{Cc}]/u

const HB_SCRIPT: Record<Script, string> = { latn: 'Latn', cyrl: 'Cyrl', grek: 'Grek' }

// Figure features whose input glyphs are often alternate (non-cmapped) forms, so
// we always proof them on a fixed numeric template rather than discovered chars.
const FIGURE_TEMPLATES: Record<string, string> = {
  onum: '0123456789  $1,234.56',
  lnum: '0123456789  $1,234.56',
  pnum: '0123456789  1 11 111',
  tnum: '0123456789  1 11 111',
  zero: '0 100 1,050.08',
  frac: '1/2  3/4  5/8  21/100',
  afrc: '1/2  3/4  5/8',
  numr: '0123456789',
  dnom: '0123456789',
}

function matchLanguage(otTag: string, script: string): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.script === script && l.otTags.includes(otTag))
}

function coverageString(chars: string[]): string {
  return [...chars].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join('')
}

/**
 * Highlight ranges from a real shaping diff, dropped when (almost) the whole
 * sample changes (e.g. small caps over an all-letters phrase) — highlighting is
 * only useful when the substitutions stand out among unaffected glyphs.
 */
function shapingHighlight(
  shaper: Shaper | undefined,
  text: string,
  before: ShapeVariant,
  after: ShapeVariant,
  script?: string,
  applyGate = true,
): HighlightRanges | undefined {
  if (!shaper) return undefined
  let ranges: HighlightRanges
  try {
    ranges = changedRanges(shaper, text, before, after, script)
  } catch {
    return undefined
  }
  if (ranges.length === 0) return undefined
  // Drop highlighting when (almost) the whole sample changes uniformly (e.g. small
  // caps over an all-letters phrase). Ligatures are exempt: their changes are
  // localized clusters, never a whole alphabet — even a sequence-heavy sample.
  if (applyGate) {
    const changed = ranges.reduce((n, [s, e]) => n + (e - s), 0)
    const nonSpace = text.replace(/\s/g, '').length
    if (nonSpace === 0 || changed / nonSpace > 0.6) return undefined
  }
  return ranges
}

interface Pending {
  tag: string
  kind: 'single' | 'ligature'
  chars?: string[]
  sequences?: string[]
  text?: string // pre-filled (figure template / case)
  affected: string[]
  before: string[]
  after: string[]
  examples?: ContextualExample[]
}

/** Build the per-language samples for the locl feature. */
async function buildLoclSample(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  shaper?: Shaper,
): Promise<FeatureSample | null> {
  const seen = new Set<string>()
  const contexts: { script: string; lang: string; lookupIndexes: number[] }[] = []
  for (const occ of feature.occurrences) {
    if (!occ.lang) continue
    const key = `${occ.script}/${occ.lang}`
    if (seen.has(key)) continue
    seen.add(key)
    contexts.push({ script: occ.script, lang: occ.lang, lookupIndexes: occ.lookupIndexes })
  }
  if (contexts.length === 0) return null

  const matchedCodes = new Set(
    contexts.map((c) => matchLanguage(c.lang, c.script)?.code).filter((c): c is string => !!c),
  )
  const scriptSet = new Set(
    contexts.map((c) => c.script).filter((s): s is Script => s === 'latn' || s === 'cyrl' || s === 'grek'),
  )
  const pools = new Map<string, string[]>()
  await Promise.all([...matchedCodes].map(async (code) => pools.set(code, await loadWordlist(code))))
  const bank = await loadWordBank(scriptSet)

  const languages: LoclLanguageSample[] = []
  for (const { script, lang, lookupIndexes } of contexts) {
    const chars = inputCharsForLookups(font, lookupIndexes, reverse)
    if (chars.length === 0) continue
    const info = matchLanguage(lang, script)
    const nativePool = info ? pools.get(info.code) ?? [] : []
    const pool = nativePool.length > 0 ? nativePool : bank[script] ?? []
    const { text, usedCoverage } =
      pool.length > 0
        ? pickSample(chars, { [script]: pool })
        : { text: coverageString(chars), usedCoverage: true }
    const hbScript = HB_SCRIPT[script as Script]
    const highlightRanges = info?.bcp47
      ? shapingHighlight(shaper, text, { language: 'en' }, { language: info.bcp47 }, hbScript)
      : undefined
    languages.push({
      otTag: lang,
      name: info?.name ?? lang,
      bcp47: info?.bcp47,
      text,
      usedCoverage,
      highlightRanges,
    })
  }
  if (languages.length === 0) return null

  languages.sort((a, b) => a.name.localeCompare(b.name))
  return { tag: feature.tag, kind: 'locl', languages }
}

interface AaltLookup {
  lookupType: number
  subtables?: unknown[]
}

/**
 * Alternate features (aalt, salt): for each base glyph, the set of alternates,
 * rendered via CSS `font-feature-settings: "<tag>" N`. Count alternates per
 * character from the type 1/3 lookups, then (if a shaper is available) confirm
 * which N values yield distinct glyphs.
 */
function buildAlternatesSample(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  shaper?: Shaper,
): FeatureSample | null {
  const gsub = (font.tables as Record<string, { lookups?: AaltLookup[] } | undefined>).gsub
  const lookups = gsub?.lookups ?? []
  const lookupIndexes = new Set<number>()
  for (const occ of feature.occurrences) for (const li of occ.lookupIndexes) lookupIndexes.add(li)

  const counts = new Map<string, number>()
  for (const li of lookupIndexes) {
    const lookup = lookups[li]
    if (!lookup) continue
    const { type, subtables } = resolveLookup(lookup)
    if (type !== 1 && type !== 3) continue
    for (const st of subtables) {
      const glyphs = coverageGlyphs(st.coverage as Parameters<typeof coverageGlyphs>[0])
      const altSets = st.alternateSets as number[][] | undefined
      glyphs.forEach((g, i) => {
        const cps = reverse.get(g)
        if (!cps || !cps.length) return
        const ch = String.fromCodePoint(cps[0])
        if (NOT_DISPLAYABLE.test(ch)) return
        const n = type === 3 ? (altSets?.[i]?.length ?? 0) : 1
        counts.set(ch, (counts.get(ch) ?? 0) + n)
      })
    }
  }

  const alternates: { char: string; indices: number[] }[] = []
  for (const [char, count] of counts) {
    if (count < 1) continue
    let indices: number[]
    if (shaper) {
      const def = shaper.shape(char, { features: [`${feature.tag}=0`] })[0]?.g
      const seen = new Set<number>([def ?? -1])
      indices = []
      for (let k = 1; k <= count; k++) {
        const g = shaper.shape(char, { features: [`${feature.tag}=${k}`] })[0]?.g
        if (g != null && !seen.has(g)) {
          seen.add(g)
          indices.push(k)
        }
      }
    } else {
      indices = Array.from({ length: count }, (_, i) => i + 1)
    }
    if (indices.length) alternates.push({ char, indices })
  }
  if (alternates.length === 0) return null

  alternates.sort((a, b) => a.char.codePointAt(0)! - b.char.codePointAt(0)!)
  return { tag: feature.tag, kind: 'alternates', alternates }
}

/**
 * Cross-feature cascade: a single-sub feature whose inputs are glyphs produced by
 * ANOTHER feature (e.g. a stylistic set that restyles dlig ligatures, often
 * PUA-encoded). Trace those inputs back to base characters + the producer
 * feature(s), and proof as [producers on] → [producers on + target on], so the
 * sample is readable (base letters) and shows the real cascade.
 */
function buildCascadeSample(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  graph: ReturnType<typeof buildSubstGraph>,
  shaper?: Shaper,
): FeatureSample | null {
  const lookupIndexes = new Set<number>()
  for (const occ of feature.occurrences) for (const li of occ.lookupIndexes) lookupIndexes.add(li)
  const gids = inputGlyphsForLookups(font, lookupIndexes)
  if (gids.length === 0) return null

  const fragments: string[] = []
  const seen = new Set<string>()
  const producers = new Set<string>()
  let derived = 0
  for (const g of gids) {
    const r = resolveGlyph(g, reverse, graph, { preferProduced: true, excludeTag: feature.tag })
    if (!r || r.features.length === 0) continue
    derived++
    r.features.forEach((f) => producers.add(f))
    if (!seen.has(r.chars) && !NOT_DISPLAYABLE.test(r.chars)) {
      seen.add(r.chars)
      fragments.push(r.chars)
    }
  }
  // Only treat as a cascade when most inputs are derived (not a normal single-sub).
  if (producers.size === 0 || fragments.length === 0 || derived / gids.length < 0.5) return null

  const on = [...producers].map((p) => `${p}=1`)
  const before = [...on, ...(feature.defaultOn ? [`${feature.tag}=0`] : [])]
  const after = [...on, `${feature.tag}=1`]
  const text = fragments.slice(0, 16).join('  ')
  return {
    tag: feature.tag,
    kind: 'single',
    text,
    usedCoverage: false,
    affected: fragments,
    highlightRanges: shapingHighlight(shaper, text, { features: before }, { features: after }, undefined, false),
    settings: { before: toCss(before), after: toCss(after) },
  }
}

/** Hb feature strings → CSS font-feature-settings ("calt=0" → `"calt" 0`). */
function toCss(features: string[]): string {
  if (features.length === 0) return 'normal'
  return features
    .map((f) => {
      const [tag, value = '1'] = f.split('=')
      return `"${tag}" ${value}`
    })
    .join(', ')
}

/**
 * Contextual feature (calt, context swashes…): derive trigger strings
 * analytically from each rule, keep those that actually change glyphs (confirmed
 * by shaping), one example per unique trigger. Producer features stay on; the
 * target is toggled.
 */
function collectContextualExamples(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
  graph: ReturnType<typeof buildSubstGraph>,
  shaper: Shaper,
  max = 48,
): ContextualExample[] {
  const examples: ContextualExample[] = []
  const seen = new Set<string>()
  for (const trigger of deriveTriggers(font, feature, reverse, graph)) {
    if (examples.length >= max) break
    const on = trigger.requiredFeatures.map((f) => `${f}=1`)
    const before = [...on, ...(feature.defaultOn ? [`${feature.tag}=0`] : [])]
    const after = [...on, `${feature.tag}=1`]
    let ranges: HighlightRanges
    try {
      ranges = changedRanges(shaper, trigger.text, { features: before }, { features: after })
    } catch {
      continue
    }
    if (ranges.length === 0) continue
    const key = trigger.text
    if (seen.has(key)) continue
    seen.add(key)
    examples.push({
      text: trigger.text,
      settings: { before: toCss(before), after: toCss(after) },
      highlightRanges: ranges,
    })
  }
  return examples
}

/** Compute before/after sample text + precise highlight ranges for previewable features. */
export async function prepareSamples(
  font: Font,
  features: FeatureInfo[],
  shaper?: Shaper,
): Promise<Map<string, FeatureSample>> {
  const reverse = buildReverseCmap(font)
  const graph = buildSubstGraph(font, features)
  const result = new Map<string, FeatureSample>()
  const pending: Pending[] = []
  const scripts = new Set<Script>()

  const noteScripts = (chars: string[]) => {
    for (const ch of chars) {
      const s = classifyScript(ch)
      if (s) scripts.add(s)
    }
  }

  for (const feature of features) {
    if (feature.tag === 'locl') {
      const locl = await buildLoclSample(font, feature, reverse, shaper)
      if (locl) result.set(feature.tag, locl)
      continue
    }

    if (
      (feature.tag === 'aalt' || feature.tag === 'salt') &&
      feature.tables.includes('GSUB') &&
      !feature.ignored
    ) {
      const alts = buildAlternatesSample(font, feature, reverse, shaper)
      if (alts) result.set(feature.tag, alts)
      continue
    }

    // case (Case-Sensitive Forms): interleave each affected glyph with capital H
    // so the cap-height alignment is visible in context.
    if (feature.tag === 'case' && feature.tables.includes('GSUB') && !feature.ignored) {
      const chars = affectedInputChars(font, feature, reverse)
      if (chars.length > 0) {
        const shown = chars.slice(0, 30)
        const text = 'H' + shown.map((c) => c + 'H').join('')
        const { before, after } = beforeAfterFeatures('case', feature.defaultOn)
        result.set('case', {
          tag: 'case',
          kind: 'single',
          text,
          usedCoverage: false,
          affected: chars,
          highlightRanges: shapingHighlight(shaper, text, { features: before }, { features: after }),
        })
      }
      continue
    }

    if (!feature.tables.includes('GSUB') || feature.ignored || SKIP.has(feature.tag)) continue

    // Figure features: fixed numeric template (their inputs are often non-cmapped).
    // But only if the template actually exercises the feature — some fonts build
    // e.g. frac from pre-formed glyphs, not raw "1/2" text; there we fall through
    // to derive the real content from the feature's lookups.
    if (FIGURE_TEMPLATES[feature.tag]) {
      const template = FIGURE_TEMPLATES[feature.tag]
      const { before, after } = beforeAfterFeatures(feature.tag, feature.defaultOn)
      const works =
        !shaper ||
        shaper.shape(template, { features: before }).map((g) => g.g).join() !==
          shaper.shape(template, { features: after }).map((g) => g.g).join()
      if (works) {
        pending.push({ tag: feature.tag, kind: 'single', text: template, affected: [], before, after })
        continue
      }
      // else: template doesn't trigger it → fall through to the dispatch below.
    }

    // Dispatch by ACTUAL lookup types, not by tag (fonts vary). A feature can mix
    // kinds: collect its contextual examples (type 5/6) AND its primary
    // ligature (type 4) / single (type 1) preview.
    const types = feature.gsubLookupTypes
    const examples =
      shaper && types.some((t) => t === 5 || t === 6)
        ? collectContextualExamples(font, feature, reverse, graph, shaper)
        : []
    let handled = false
    if (types.includes(4)) {
      const { sequences, producers } = reconstructLigatures(font, feature, reverse, graph)
      if (sequences.length > 0 && producers.length > 0) {
        // Cascade-ligature: components are produced by other features (e.g. frac
        // ligating aalt-made digit forms). Enable producers, then toggle target —
        // proof on the real base sequences, not a hard-coded fraction template.
        const on = producers.map((p) => `${p}=1`)
        const before = [...on, ...(feature.defaultOn ? [`${feature.tag}=0`] : [])]
        const after = [...on, `${feature.tag}=1`]
        const text = sequences.slice(0, 16).join('  ')
        const sample: FeatureSample = {
          tag: feature.tag,
          kind: 'single',
          text,
          usedCoverage: false,
          affected: sequences,
          highlightRanges: shapingHighlight(shaper, text, { features: before }, { features: after }, undefined, false),
          settings: { before: toCss(before), after: toCss(after) },
        }
        if (examples.length > 0) sample.examples = examples
        result.set(feature.tag, sample)
        noteScripts(sequences.map((s) => s[0]))
        handled = true
      } else if (sequences.length > 0) {
        const { before, after } = ligatureFeatures(feature.tag)
        pending.push({ tag: feature.tag, kind: 'ligature', sequences, affected: sequences, before, after, examples })
        noteScripts(sequences.map((s) => s[0]))
        handled = true
      }
    }
    if (!handled && types.includes(1)) {
      // Cross-feature cascade: inputs are glyphs another feature produces.
      const cascade = buildCascadeSample(font, feature, reverse, graph, shaper)
      if (cascade) {
        if (examples.length > 0 && cascade.kind !== 'locl' && cascade.kind !== 'alternates') {
          cascade.examples = examples
        }
        result.set(feature.tag, cascade)
        handled = true
      } else {
        const chars = affectedInputChars(font, feature, reverse)
        if (chars.length > 0) {
          const { before, after } = beforeAfterFeatures(feature.tag, feature.defaultOn)
          pending.push({ tag: feature.tag, kind: 'single', chars, affected: chars, before, after, examples })
          noteScripts(chars)
          handled = true
        }
      }
    }
    if (!handled && examples.length > 0) {
      // Contextual-only feature (calt): no single/ligature primary, just examples.
      result.set(feature.tag, {
        tag: feature.tag,
        kind: 'single',
        text: '',
        usedCoverage: false,
        affected: [],
        examples,
      })
    }
  }

  const bank = await loadWordBank(scripts)

  for (const item of pending) {
    let text: string
    let usedCoverage = false
    if (item.kind === 'ligature') {
      const script = item.sequences![0] ? classifyScript(item.sequences![0][0]) : null
      const pool = (script && bank[script]) || []
      ;({ text, usedCoverage } = pickLigatureSample(item.sequences!, pool))
    } else if (item.text !== undefined) {
      text = item.text
    } else {
      ;({ text, usedCoverage } = pickSample(item.chars!, bank))
    }
    result.set(item.tag, {
      tag: item.tag,
      kind: item.kind,
      text,
      usedCoverage,
      affected: item.affected,
      highlightRanges: shapingHighlight(
        shaper,
        text,
        { features: item.before },
        { features: item.after },
        undefined,
        item.kind !== 'ligature', // ligatures: don't gate by ratio
      ),
      examples: item.examples && item.examples.length > 0 ? item.examples : undefined,
    })
  }

  return result
}
