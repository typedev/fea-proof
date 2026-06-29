// Unicode standard character names (e.g. "COMBINING ACUTE ACCENT"). JS has no
// built-in name database, so we ship a trimmed table (everything below U+3000 —
// Latin/Greek/Cyrillic/Arabic/Hebrew + all combining marks — plus the Latin
// Extended-D/E and presentation/combining-half-mark blocks) and load it lazily
// the first time the mark explorer opens. CJK ideographs have formulaic names,
// so those are derived instead of stored.

let cache: Record<string, string> | null = null
let loading: Promise<Record<string, string>> | null = null

/** Lazily load the Unicode names table (a ~440KB JSON chunk). */
export function loadUnicodeNames(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache)
  if (!loading) {
    loading = import('./unicodeNames.json').then((m) => (cache = m.default as Record<string, string>))
  }
  return loading
}

const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0')

/** Formulaic names for the large algorithmic ranges not stored in the table. */
function algorithmicName(cp: number): string | undefined {
  if (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2ebef) ||
    (cp >= 0x30000 && cp <= 0x323af)
  ) {
    return `CJK UNIFIED IDEOGRAPH-${hex(cp)}`
  }
  return undefined
}

/** Unicode name for a codepoint, given a (possibly null) loaded table. */
export function unicodeName(cp: number, table: Record<string, string> | null): string | undefined {
  return algorithmicName(cp) ?? table?.[String(cp)] ?? undefined
}
