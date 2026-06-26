import type { Font } from 'opentype.js'
import type { FeatureInfo } from '../core/types'
import { buildReverseCmap } from '../core/glyphs'
import { affectedInputChars, inputCharsForLookups } from '../core/features/single'
import { reconstructLigatures } from '../core/features/ligature'
import { classifyScript, pickSample, pickLigatureSample } from './pick'
import { LANGUAGES, loadWordlist, loadWordBank, type LanguageInfo, type Script } from './languages'

export interface LoclLanguageSample {
  otTag: string
  name: string
  /** BCP-47 tag for the lang attribute, if known. */
  bcp47?: string
  text: string
  usedCoverage: boolean
  /** Affected characters to highlight in the sample. */
  highlight?: string[]
}

export type FeatureSample =
  | {
      tag: string
      kind: 'single' | 'ligature'
      text: string
      usedCoverage: boolean
      /** Affected characters / ligature sequences to highlight in the sample. */
      highlight?: string[]
      /** Full set of affected chars (single) / sequences (ligature) for the inventory. */
      affected: string[]
    }
  | { tag: string; kind: 'locl'; languages: LoclLanguageSample[] }

const LIGATURE_TAGS = new Set(['liga', 'dlig', 'clig', 'hlig', 'rlig'])
const SKIP_FOR_SINGLE = new Set(['locl', 'aalt', 'ccmp'])

// Above this many affected glyphs, highlighting marks (almost) everything and
// stops being useful (e.g. small caps over the whole alphabet) — so we skip it.
const MAX_HIGHLIGHT_GLYPHS = 12

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

function isLigaturePreviewable(feature: FeatureInfo): boolean {
  return (
    feature.tables.includes('GSUB') &&
    !feature.ignored &&
    LIGATURE_TAGS.has(feature.tag) &&
    feature.gsubLookupTypes.includes(4)
  )
}

export function isSinglePreviewable(feature: FeatureInfo): boolean {
  return (
    feature.tables.includes('GSUB') &&
    !feature.ignored &&
    !LIGATURE_TAGS.has(feature.tag) &&
    !SKIP_FOR_SINGLE.has(feature.tag) &&
    feature.gsubLookupTypes.includes(1)
  )
}

function matchLanguage(otTag: string, script: string): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.script === script && l.otTags.includes(otTag))
}

function coverageString(chars: string[]): string {
  return [...chars].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join('')
}

interface PendingSingle {
  tag: string
  kind: 'single'
  chars?: string[]
  text?: string // pre-filled (figure template)
}
interface PendingLigature {
  tag: string
  kind: 'ligature'
  sequences: string[]
}

/** Build the per-language samples for the locl feature. */
async function buildLoclSample(
  font: Font,
  feature: FeatureInfo,
  reverse: Map<number, number[]>,
): Promise<FeatureSample | null> {
  // Unique (script, lang) contexts with a real language system.
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

  // Native wordlists for recognized languages (e.g. SRB → Serbian Cyrillic),
  // plus a script-pooled bank as fallback for languages we don't have a list for.
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
    languages.push({
      otTag: lang,
      name: info?.name ?? lang,
      bcp47: info?.bcp47,
      text,
      usedCoverage,
      highlight: !usedCoverage && chars.length <= MAX_HIGHLIGHT_GLYPHS ? chars : undefined,
    })
  }
  if (languages.length === 0) return null

  languages.sort((a, b) => a.name.localeCompare(b.name))
  return { tag: feature.tag, kind: 'locl', languages }
}

/** Compute before/after sample text for previewable features. */
export async function prepareSamples(
  font: Font,
  features: FeatureInfo[],
): Promise<Map<string, FeatureSample>> {
  const reverse = buildReverseCmap(font)
  const result = new Map<string, FeatureSample>()
  const pending: (PendingSingle | PendingLigature)[] = []
  const scripts = new Set<Script>()

  const noteScripts = (chars: string[]) => {
    for (const ch of chars) {
      const s = classifyScript(ch)
      if (s) scripts.add(s)
    }
  }

  for (const feature of features) {
    if (feature.tag === 'locl') {
      const locl = await buildLoclSample(font, feature, reverse)
      if (locl) result.set(feature.tag, locl)
      continue
    }

    // Figure features: fixed numeric template.
    if (
      FIGURE_TEMPLATES[feature.tag] &&
      feature.tables.includes('GSUB') &&
      !feature.ignored
    ) {
      pending.push({ tag: feature.tag, kind: 'single', text: FIGURE_TEMPLATES[feature.tag] })
      continue
    }

    if (isLigaturePreviewable(feature)) {
      const sequences = reconstructLigatures(font, feature, reverse)
      if (sequences.length === 0) continue
      pending.push({ tag: feature.tag, kind: 'ligature', sequences })
      noteScripts(sequences.map((s) => s[0]))
    } else if (isSinglePreviewable(feature)) {
      const chars = affectedInputChars(font, feature, reverse)
      if (chars.length === 0) continue
      pending.push({ tag: feature.tag, kind: 'single', chars })
      noteScripts(chars)
    }
  }

  const bank = await loadWordBank(scripts)

  for (const item of pending) {
    if (item.kind === 'ligature') {
      const script = item.sequences[0] ? classifyScript(item.sequences[0][0]) : null
      const pool = (script && bank[script]) || []
      const { text, usedCoverage } = pickLigatureSample(item.sequences, pool)
      result.set(item.tag, {
        tag: item.tag,
        kind: 'ligature',
        text,
        usedCoverage,
        // ligatures are many→one — the components stand out, always worth marking
        highlight: usedCoverage ? undefined : item.sequences,
        affected: item.sequences,
      })
    } else if (item.text !== undefined) {
      // figure template — the whole sample is affected, nothing specific to mark
      result.set(item.tag, {
        tag: item.tag,
        kind: 'single',
        text: item.text,
        usedCoverage: false,
        affected: [],
      })
    } else {
      const chars = item.chars!
      const { text, usedCoverage } = pickSample(chars, bank)
      result.set(item.tag, {
        tag: item.tag,
        kind: 'single',
        text,
        usedCoverage,
        // 1:1 subs: mark only when they touch few glyphs (cv01/locl), not whole alphabets
        highlight: !usedCoverage && chars.length <= MAX_HIGHLIGHT_GLYPHS ? chars : undefined,
        affected: chars,
      })
    }
  }

  return result
}
