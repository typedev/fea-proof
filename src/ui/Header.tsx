import type { LoadedFont } from '../core/types'
import { useVariationSettings } from '../render/variationContext'

const SCRIPT_LABELS: Record<string, string> = {
  latn: 'Latin',
  cyrl: 'Cyrillic',
  grek: 'Greek',
  DFLT: 'Default',
  arab: 'Arabic',
  hebr: 'Hebrew',
  deva: 'Devanagari',
}

export function Header({ loaded }: { loaded: LoadedFont }) {
  const fontVariationSettings = useVariationSettings()
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1
          // This is a SPECIMEN: the text is drawn in the loaded font itself, so we
          // must show its true design. No `font-semibold` (it would make the browser
          // FAUX-bold a font that lacks a real 600 weight), and font-synthesis: none
          // so neither weight nor slant is ever synthesized — an upright-only or
          // single-weight face renders honestly instead of being faked.
          // https://clagnut.com/blog/2438
          className="text-3xl"
          style={{
            fontFamily: `"${loaded.cssFamily}", system-ui`,
            fontVariationSettings,
            fontWeight: 'normal',
            fontSynthesis: 'none',
          }}
        >
          {loaded.familyName}
        </h1>
        {loaded.subfamilyName && (
          <span className="text-sm text-neutral-400">{loaded.subfamilyName}</span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
        <Meta label="File" value={loaded.fileName} />
        <Meta label="Version" value={loaded.version || '—'} />
        <Meta
          label="Scripts"
          value={
            loaded.scripts.length
              ? loaded.scripts.map((s) => SCRIPT_LABELS[s] ?? s).join(', ')
              : '—'
          }
        />
        <Meta label="GSUB" value={loaded.hasGsub ? 'present' : 'none'} />
      </dl>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="truncate text-neutral-700 dark:text-neutral-200" title={value}>
        {value}
      </dd>
    </div>
  )
}
