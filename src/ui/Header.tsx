import type { LoadedFont } from '../core/types'

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
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: `"${loaded.cssFamily}", system-ui` }}
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
      <dd className="truncate text-neutral-200" title={value}>
        {value}
      </dd>
    </div>
  )
}
