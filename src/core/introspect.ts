import type { Font } from 'opentype.js'
import type { FeatureInfo, FeatureOccurrence } from './types'
import { featureName, isDefaultOn, isIgnored } from './registry'
import { readFeatureUiNames } from './featureNames'

// Minimal structural views over opentype.js' parsed GSUB/GPOS tables.
interface LangSys {
  reqFeatureIndex: number
  featureIndexes: number[]
}
interface ScriptRecord {
  tag: string
  script: {
    defaultLangSys?: LangSys
    langSysRecords?: { tag: string; langSys: LangSys }[]
  }
}
interface FeatureRecord {
  tag: string
  feature: { featureParams: number; lookupListIndexes: number[] }
}
interface LookupSubtable {
  extensionLookupType?: number
  lookupType?: number
}
interface Lookup {
  lookupType: number
  subtables?: LookupSubtable[]
}
interface LayoutTableData {
  scripts?: ScriptRecord[]
  features?: FeatureRecord[]
  lookups?: Lookup[]
}

interface RawFeature {
  occurrences: FeatureOccurrence[]
  lookupTypes: Set<number>
}

/** Resolve a lookup's effective type, unwrapping Extension Substitution (type 7). */
function effectiveLookupType(lookups: Lookup[], index: number): number | undefined {
  const lookup = lookups[index]
  if (!lookup) return undefined
  if (lookup.lookupType === 7) {
    const sub = lookup.subtables?.[0]
    return sub?.extensionLookupType ?? sub?.lookupType ?? 7
  }
  return lookup.lookupType
}

/** Walk one layout table (gsub/gpos) into a tag → occurrences map. */
function readLayout(font: Font, tableName: 'gsub' | 'gpos'): Map<string, RawFeature> {
  const table = (font.tables as Record<string, LayoutTableData | undefined>)[tableName]
  const map = new Map<string, RawFeature>()
  if (!table?.scripts || !table.features) return map

  const features = table.features
  const lookups = table.lookups ?? []

  for (const scriptRecord of table.scripts) {
    const scriptTag = scriptRecord.tag.trim() || scriptRecord.tag
    const langSystems: { lang: string; langSys: LangSys }[] = []
    if (scriptRecord.script.defaultLangSys) {
      langSystems.push({ lang: '', langSys: scriptRecord.script.defaultLangSys })
    }
    for (const record of scriptRecord.script.langSysRecords ?? []) {
      langSystems.push({ lang: record.tag.trim() || record.tag, langSys: record.langSys })
    }

    for (const { lang, langSys } of langSystems) {
      for (const featureIndex of langSys.featureIndexes ?? []) {
        const featureRecord = features[featureIndex]
        if (!featureRecord) continue
        const tag = featureRecord.tag
        const lookupIndexes = featureRecord.feature.lookupListIndexes ?? []

        let entry = map.get(tag)
        if (!entry) {
          entry = { occurrences: [], lookupTypes: new Set() }
          map.set(tag, entry)
        }
        entry.occurrences.push({ script: scriptTag, lang, lookupIndexes })
        for (const li of lookupIndexes) {
          const type = effectiveLookupType(lookups, li)
          if (type !== undefined) entry.lookupTypes.add(type)
        }
      }
    }
  }
  return map
}

/** Analyze all GSUB/GPOS features of a font into a sorted, enriched list. */
export function analyzeFeatures(font: Font, sfnt?: ArrayBuffer): FeatureInfo[] {
  const gsub = readLayout(font, 'gsub')
  const gpos = readLayout(font, 'gpos')
  const tags = new Set<string>([...gsub.keys(), ...gpos.keys()])
  // Designer UI labels for ssXX/cvXX (from GSUB FeatureParams), if we have bytes.
  const uiNames = sfnt ? readFeatureUiNames(font, sfnt) : new Map<string, string>()

  const result: FeatureInfo[] = []
  for (const tag of tags) {
    const g = gsub.get(tag)
    const p = gpos.get(tag)
    const tables: FeatureInfo['tables'] = []
    if (g) tables.push('GSUB')
    if (p) tables.push('GPOS')

    const allOccurrences = [...(g?.occurrences ?? []), ...(p?.occurrences ?? [])]
    const scripts = [...new Set(allOccurrences.map((o) => o.script))].sort()
    const langs = [...new Set(allOccurrences.map((o) => o.lang).filter(Boolean))].sort()

    result.push({
      tag,
      name: featureName(tag),
      uiName: uiNames.get(tag),
      tables,
      defaultOn: isDefaultOn(tag),
      ignored: isIgnored(tag),
      scripts,
      langs,
      occurrences: g?.occurrences ?? p?.occurrences ?? [],
      gsubLookupTypes: g ? [...g.lookupTypes].sort((a, b) => a - b) : [],
    })
  }

  // GSUB (previewable) first, then GPOS-only; alphabetically within each group.
  result.sort((a, b) => {
    const ga = a.tables.includes('GSUB') ? 0 : 1
    const gb = b.tables.includes('GSUB') ? 0 : 1
    return ga - gb || a.tag.localeCompare(b.tag)
  })
  return result
}
