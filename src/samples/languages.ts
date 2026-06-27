export type Script = 'latn' | 'cyrl' | 'grek'

export interface LanguageInfo {
  /** Wordlist file key (matches wordlists/<code>.json). */
  code: string
  name: string
  script: Script
  /** BCP-47 tag for the HTML lang attribute. */
  bcp47: string
  /** OpenType language system tags this language maps to (for locl matching). */
  otTags: string[]
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', script: 'latn', bcp47: 'en', otTags: ['ENG'] },
  { code: 'de', name: 'German', script: 'latn', bcp47: 'de', otTags: ['DEU'] },
  { code: 'fr', name: 'French', script: 'latn', bcp47: 'fr', otTags: ['FRA'] },
  { code: 'es', name: 'Spanish', script: 'latn', bcp47: 'es', otTags: ['ESP'] },
  { code: 'it', name: 'Italian', script: 'latn', bcp47: 'it', otTags: ['ITA'] },
  { code: 'pt', name: 'Portuguese', script: 'latn', bcp47: 'pt', otTags: ['PTG'] },
  { code: 'nl', name: 'Dutch', script: 'latn', bcp47: 'nl', otTags: ['NLD'] },
  { code: 'pl', name: 'Polish', script: 'latn', bcp47: 'pl', otTags: ['PLK'] },
  { code: 'cs', name: 'Czech', script: 'latn', bcp47: 'cs', otTags: ['CSY'] },
  { code: 'ro', name: 'Romanian', script: 'latn', bcp47: 'ro', otTags: ['ROM', 'MOL'] },
  { code: 'hu', name: 'Hungarian', script: 'latn', bcp47: 'hu', otTags: ['HUN'] },
  { code: 'sr', name: 'Serbian (Latin)', script: 'latn', bcp47: 'sr-Latn', otTags: ['SRB'] },
  { code: 'ca', name: 'Catalan', script: 'latn', bcp47: 'ca', otTags: ['CAT'] },
  { code: 'tr', name: 'Turkish', script: 'latn', bcp47: 'tr', otTags: ['TRK'] },
  { code: 'az', name: 'Azerbaijani', script: 'latn', bcp47: 'az', otTags: ['AZE'] },
  { code: 'crh', name: 'Crimean Tatar', script: 'latn', bcp47: 'crh', otTags: ['CRT'] },
  { code: 'kk-Latn', name: 'Kazakh (Latin)', script: 'latn', bcp47: 'kk-Latn', otTags: ['KAZ'] },
  { code: 'tt-Latn', name: 'Tatar (Latin)', script: 'latn', bcp47: 'tt-Latn', otTags: ['TAT'] },
  { code: 'se', name: 'Northern Sami', script: 'latn', bcp47: 'se', otTags: ['NSM'] },
  { code: 'sms', name: 'Skolt Sami', script: 'latn', bcp47: 'sms', otTags: ['SKS'] },
  { code: 'la', name: 'Latin', script: 'latn', bcp47: 'la', otTags: ['LAT'] },
  { code: 'ru', name: 'Russian', script: 'cyrl', bcp47: 'ru', otTags: ['RUS'] },
  { code: 'uk', name: 'Ukrainian', script: 'cyrl', bcp47: 'uk', otTags: ['UKR'] },
  { code: 'bg', name: 'Bulgarian', script: 'cyrl', bcp47: 'bg', otTags: ['BGR'] },
  { code: 'mk', name: 'Macedonian', script: 'cyrl', bcp47: 'mk', otTags: ['MKD'] },
  { code: 'sr-Cyrl', name: 'Serbian (Cyrillic)', script: 'cyrl', bcp47: 'sr-Cyrl', otTags: ['SRB'] },
  { code: 'ba', name: 'Bashkir', script: 'cyrl', bcp47: 'ba', otTags: ['BSH'] },
  { code: 'cu', name: 'Church Slavonic', script: 'cyrl', bcp47: 'cu', otTags: ['CHU'] },
  { code: 'el', name: 'Greek', script: 'grek', bcp47: 'el', otTags: ['ELL'] },
]

// NOTE: `code` doubles as the wordlist key. Entries above without a
// matching wordlists/<code>.json (e.g. Turkic/Sami langs) still resolve a
// human name + BCP-47 for locl; sample words fall back to the script's
// general word bank, and the localized-forms inventory shows the full set.

/** Languages used (in priority order) to source words for each script. */
export const PICK_LANGS: Record<Script, string[]> = {
  latn: ['en', 'de', 'fr', 'es', 'it', 'pl', 'cs', 'ro', 'pt', 'nl', 'hu'],
  cyrl: ['ru', 'uk', 'bg', 'mk', 'sr-Cyrl'],
  grek: ['el'],
}

// Lazily-loaded wordlist JSON (kept out of the main bundle).
const wordlistModules = import.meta.glob('./wordlists/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<string[]>
>

export async function loadWordlist(code: string): Promise<string[]> {
  const loader = wordlistModules[`./wordlists/${code}.json`]
  if (!loader) return []
  try {
    return await loader()
  } catch {
    return []
  }
}

/** Load and pool the wordlists for the given scripts, in priority order. */
export async function loadWordBank(scripts: Iterable<Script>): Promise<Record<string, string[]>> {
  const bank: Record<string, string[]> = {}
  for (const script of scripts) {
    const codes = PICK_LANGS[script] ?? []
    const lists = await Promise.all(codes.map(loadWordlist))
    bank[script] = lists.flat()
  }
  return bank
}
