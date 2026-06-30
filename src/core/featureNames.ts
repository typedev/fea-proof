import type { Font } from 'opentype.js'
import { findTable } from './variations'

// Designer-supplied UI names for ssXX / cvXX features. opentype.js parses the
// GSUB FeatureList but exposes `featureParams` only as a raw offset16 (not the
// FeatureParams contents), so — like featureVariations.ts / itemVariationStore.ts —
// we DataView-parse it ourselves. The label STRING does come from opentype.js:
// custom name records (nameID >= 256) survive in `font.names.<platform>[nameID]`
// keyed by their numeric id (parseNameTable falls back to the raw id), even
// multilingual — so we don't touch the `name` table bytes.
//
// ssXX → FeatureParamsStylisticSet { version, UINameID }.
// cvXX → FeatureParamsCharacterVariants { format, FeatUILabelNameID, ... }.
// Both put the label nameID at params+2; we read only that label for now (the
// cv tooltip / sample-text / per-character ids are deferred).

/** Resolve a (possibly custom) nameID to a string, preferring English. */
function resolveName(font: Font, nameId: number): string | undefined {
  const names = font.names as unknown as Record<string, Record<number, Record<string, string>>>
  for (const platform of ['windows', 'macintosh', 'unicode']) {
    const entry = names[platform]?.[nameId]
    if (entry) return entry.en ?? Object.values(entry)[0]
  }
  return undefined
}

/**
 * Map ssXX/cvXX tags to their designer UI label, read from GSUB FeatureParams.
 * Returns an empty map for fonts with no GSUB or no named feature params; never
 * throws (malformed tables degrade to no names).
 */
export function readFeatureUiNames(font: Font, sfnt: ArrayBuffer): Map<string, string> {
  const result = new Map<string, string>()
  try {
    const gsub = findTable(sfnt, 'GSUB')
    if (gsub == null) return result
    const dv = new DataView(sfnt)
    const featureListStart = gsub + dv.getUint16(gsub + 6) // FeatureList offset
    const featureCount = dv.getUint16(featureListStart)
    let rec = featureListStart + 2
    for (let i = 0; i < featureCount; i++, rec += 6) {
      const tag = String.fromCharCode(
        dv.getUint8(rec), dv.getUint8(rec + 1), dv.getUint8(rec + 2), dv.getUint8(rec + 3),
      )
      if (!/^(ss|cv)\d\d$/.test(tag) || result.has(tag)) continue
      const featureTable = featureListStart + dv.getUint16(rec + 4)
      const paramsOffset = dv.getUint16(featureTable) // FeatureParams, 0 = none
      if (paramsOffset === 0) continue
      const nameId = dv.getUint16(featureTable + paramsOffset + 2) // label nameID
      if (!nameId) continue
      const label = resolveName(font, nameId)
      if (label) result.set(tag, label)
    }
  } catch {
    /* malformed FeatureList/FeatureParams — degrade to no names */
  }
  return result
}
