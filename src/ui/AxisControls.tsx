import { useState } from 'react'
import { defaultCoords, type NamedInstance, type VariationAxis } from '../core/variations'

const CUSTOM = '__custom__'

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/**
 * Compact variable-font axis controls: one slider per VISIBLE axis (hidden axes
 * are excluded but stay in `coords`, so they still render at their held value),
 * an optional named-instance picker, and a reset. When a font exposes many axes
 * the block collapses to keep the sticky bar short.
 *
 * Future (avar2): fonts can declare dozens of axes — a flat slider row doesn't
 * scale to that. A grouped / searchable register-style UI is left as follow-up;
 * the data model already tolerates any axis count.
 */
export function AxisControls({
  axes,
  instances,
  coords,
  onCoords,
}: {
  axes: VariationAxis[]
  instances: NamedInstance[]
  coords: Record<string, number>
  onCoords: (c: Record<string, number>) => void
}) {
  const visible = axes.filter((a) => !a.hidden)
  const collapsible = visible.length > 4
  const [open, setOpen] = useState(false)
  if (visible.length === 0) return null

  const activeInstance = instances.find((inst) =>
    axes.every((a) => (inst.coords[a.tag] ?? a.default) === coords[a.tag]),
  )
  const setAxis = (tag: string, v: number) => onCoords({ ...coords, [tag]: v })

  const show = !collapsible || open
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {collapsible && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {open ? '▾' : '▸'} Variations · {visible.length} axes
          </button>
        )}
        {!collapsible && (
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Variations
          </span>
        )}
        {instances.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            Instance
            <select
              value={activeInstance?.name ?? CUSTOM}
              onChange={(e) => {
                const inst = instances.find((i) => i.name === e.target.value)
                if (inst) onCoords({ ...coords, ...inst.coords })
              }}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              {!activeInstance && <option value={CUSTOM}>Custom</option>}
              {instances.map((inst) => (
                <option key={inst.name} value={inst.name}>
                  {inst.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => onCoords(defaultCoords(axes))}
          className="ml-auto rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          title="Reset all axes to their default values"
        >
          Reset
        </button>
      </div>
      {show && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {visible.map((a) => (
            <label
              key={a.tag}
              className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
              title={a.name}
            >
              <span className="font-mono text-xs uppercase text-neutral-600 dark:text-neutral-300">{a.tag}</span>
              <input
                type="range"
                min={a.min}
                max={a.max}
                step={a.max - a.min > 50 ? 1 : 0.1}
                value={coords[a.tag] ?? a.default}
                onChange={(e) => setAxis(a.tag, Number(e.target.value))}
                className="accent-indigo-500"
              />
              <span className="w-10 tabular-nums text-neutral-700 dark:text-neutral-300">
                {fmt(coords[a.tag] ?? a.default)}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
