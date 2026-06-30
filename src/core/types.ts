import type { Font } from 'opentype.js'
import type { FontVariations } from './variations'

/** A font loaded into the app: parsed for introspection + registered for CSS rendering. */
export interface LoadedFont {
  /** opentype.js parsed font (from decompressed sfnt). */
  font: Font
  fileName: string
  familyName: string
  subfamilyName: string
  version: string
  /** Unique font-family name registered via FontFace, used in CSS previews. */
  cssFamily: string
  /** Unique script tags present in GSUB/GPOS (e.g. latn, cyrl, grek, DFLT). */
  scripts: string[]
  /** Whether the font has a GSUB table at all. */
  hasGsub: boolean
  /** Decompressed sfnt bytes (for HarfBuzz shaping). */
  sfnt: ArrayBuffer
  /** fvar axes + named instances, or null if not a variable font. */
  variations: FontVariations | null
}

/** One (script, language) context in which a feature is registered. */
export interface FeatureOccurrence {
  /** Script tag, trimmed (e.g. "latn", "cyrl", "DFLT"). */
  script: string
  /** Language system tag, trimmed; "" means the default language system. */
  lang: string
  /** Lookup indexes (into the table's lookup list) for this occurrence. */
  lookupIndexes: number[]
}

/** A single OpenType layout table a feature lives in. */
export type LayoutTable = 'GSUB' | 'GPOS'

/** A feature tag as found in GSUB and/or GPOS, with where it applies. */
export interface FeatureInfo {
  tag: string
  /** Human-readable name (registry + generated for ssXX/cvXX). */
  name: string
  /** Designer-supplied label from GSUB FeatureParams (ssXX/cvXX), if present. */
  uiName?: string
  /** Tables the feature appears in. */
  tables: LayoutTable[]
  /** Whether the shaper enables this feature by default. */
  defaultOn: boolean
  /** Whether we skip producing a before/after proof for it (e.g. kern). */
  ignored: boolean
  /** Distinct script tags (trimmed) the feature is registered under. */
  scripts: string[]
  /** Distinct non-default language system tags (trimmed). */
  langs: string[]
  /** Per-context occurrences, merged across tables. */
  occurrences: FeatureOccurrence[]
  /** Distinct GSUB lookup types involved (1=single, 4=ligature, 6=chaining…). */
  gsubLookupTypes: number[]
}
