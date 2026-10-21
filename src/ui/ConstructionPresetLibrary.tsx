import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { downloadBlob } from './download'
import type { ConstructionDraft } from '../scene/constructionDraft'
import type { MaterialDef } from '../scene/types'
import {
  CONSTRUCTION_GROUPS,
  CONSTRUCTION_PRESETS_KEY,
  PRESET_FILE_LIMIT,
  appendConstructionPresets,
  captureConstructionPreset,
  constructionDifferences,
  parseConstructionPresets,
  serializeConstructionPresets,
  stageConstructionPreset,
  type ConstructionGroup,
  type ConstructionPreset,
  type PresetKey,
} from '../scene/constructionPresets'

function readLibrary() {
  try {
    const raw = localStorage.getItem(CONSTRUCTION_PRESETS_KEY)
    return {
      raw,
      entries: raw === null ? [] : parseConstructionPresets(raw),
      ready: true,
      error: '',
    }
  } catch (cause) {
    return {
      raw: null,
      entries: [] as ConstructionPreset[],
      ready: false,
      error: `Could not load construction presets: ${message(cause)} Stored data has not been replaced.`,
    }
  }
}
function message(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Storage is unavailable.'
}
const labels: Record<ConstructionGroup, string> = {
  shell: 'Shell and back',
  base: 'Base and toe kick',
  fronts: 'Front mounting and reveal',
  frame: 'Face frame',
  materials: 'Panel materials',
  joinery: 'Joint method',
}
const settingLabels: Record<PresetKey, string> = {
  hasTop: 'Include top panel',
  backMode: 'Back construction',
  baseMode: 'Base construction',
  toeKickHeight: 'Toe-kick height (mm)',
  toeKickSetback: 'Toe-kick setback (mm)',
  frontMount: 'Front mounting',
  frontReveal: 'Front reveal (mm)',
  frameEnabled: 'Face frame',
  stileWidth: 'Edge stile width (mm)',
  railWidth: 'Edge rail width (mm)',
  midStileWidth: 'Middle stile width (mm)',
  midRailWidth: 'Middle rail width (mm)',
  pairStile: 'Centre stile between paired doors',
  carcaseMaterial: 'Carcase material',
  backMaterial: 'Back material',
  frontMaterial: 'Front material',
  frameMaterial: 'Frame material',
  jointMethod: 'Joint method',
}
function displaySetting(value: string | boolean) {
  const choices: Record<string, string> = {
    'butt-screw': 'Butt + screws',
    'dado-rabbet': 'Dado + rabbet',
    finger: 'Box / finger',
    dowel: 'Dowel',
    confirmat: 'Confirmat',
    'toe-kick': 'Toe kick',
    ladder: 'Ladder base',
    legs: 'Legs',
    none: 'None',
    captured: 'Captured',
    applied: 'Applied',
    overlay: 'Overlay',
    inset: 'Inset',
    'half-overlay': 'Half overlay',
  }
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (choices[value] ?? value)
}
export function ConstructionPresetLibrary({
  draft,
  stale,
  materials,
  onStage,
}: {
  draft: ConstructionDraft
  stale: boolean
  materials: Record<string, MaterialDef>
  onStage: (draft: ConstructionDraft) => void
}) {
  const [library, setLibrary] = useState(readLibrary)
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [groups, setGroups] = useState<ConstructionGroup[]>(
    Object.keys(CONSTRUCTION_GROUPS) as ConstructionGroup[],
  )
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const generation = useRef({ value: 0 })
  const libraryRef = useRef(library)
  useEffect(() => {
    libraryRef.current = library
  }, [library])
  const entry = library.entries.find((p) => p.id === selected)
  const next = entry ? stageConstructionPreset(draft, entry, groups) : draft
  const differences = constructionDifferences(draft, next)
  const missing =
    entry && groups.includes('materials')
      ? [...new Set(CONSTRUCTION_GROUPS.materials.map((key) => entry.settings[key]))].filter(
          (key) =>
            !materials[key] ||
            materials[key].use === 'edge' ||
            !Number.isFinite(materials[key].thickness) ||
            (materials[key].thickness ?? 0) <= 0,
        )
      : []
  const choose = (p: ConstructionPreset) => {
    setSelected(p.id)
    setName(p.name)
    setDescription(p.description)
    setDeleting(false)
  }
  useEffect(() => {
    const requests = generation.current
    const refresh = (event: StorageEvent) => {
      if (event.key === CONSTRUCTION_PRESETS_KEY || event.key === null) {
        requests.value++
        setLibrary(readLibrary())
        setDeleting(false)
        setStatus('Construction preset library refreshed.')
        setError('')
      }
    }
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      requests.value++
    }
  }, [])
  const write = (change: (entries: ConstructionPreset[]) => ConstructionPreset[]) => {
    generation.current.value++
    setStatus('')
    setError('')
    try {
      const current = libraryRef.current
      if (!current.ready) throw Error('Reload the local library before editing it.')
      if (localStorage.getItem(CONSTRUCTION_PRESETS_KEY) !== current.raw) {
        setLibrary(readLibrary())
        throw Error('The library changed in another tab. It has been refreshed; retry your change.')
      }
      const raw = serializeConstructionPresets(change(current.entries))
      const entries = parseConstructionPresets(raw)
      localStorage.setItem(CONSTRUCTION_PRESETS_KEY, raw)
      const updated = { entries, raw, ready: true, error: '' }
      libraryRef.current = updated
      setLibrary(updated)
      setDeleting(false)
      return entries
    } catch (cause) {
      setError(`Preset change was not saved: ${message(cause)}`)
      return null
    }
  }
  const capture = (replace: boolean) => {
    try {
      const saved = captureConstructionPreset(name, description, draft)
      const entries = write((current) =>
        replace && entry
          ? current.map((p) =>
              p.id === entry.id ? { ...saved, id: p.id, createdAt: p.createdAt } : p,
            )
          : appendConstructionPresets(current, [saved]),
      )
      if (entries) {
        choose(replace ? entries.find((p) => p.id === entry!.id)! : entries.at(-1)!)
        setStatus(replace ? 'Preset replaced from draft.' : 'Construction preset saved locally.')
      }
    } catch (cause) {
      setError(message(cause))
    }
  }
  const exportEntries = (entries: ConstructionPreset[], filename: string) => {
    try {
      downloadBlob(serializeConstructionPresets(entries), filename, 'application/json')
      setError('')
      setStatus('Construction preset JSON exported.')
    } catch (cause) {
      setError(message(cause))
    }
  }
  const visible = library.entries
    .filter((p) =>
      `${p.name} ${p.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt))
  return (
    <details className="border rounded p-3" aria-label="Personal construction presets">
      <summary className="cursor-pointer font-medium">Personal construction presets</summary>
      <section aria-label="Construction preset library" className="space-y-3 pt-3">
        <p>
          Save construction settings in this browser. Export JSON for a portable copy. Presets stage
          the draft; use Preview construction before applying. Cabinet size, opening layouts, board
          overrides and catalogue pins are retained.
        </p>
        {(error || library.error) && <p role="alert">{error || library.error}</p>}
        {status && <p role="status">{status}</p>}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            generation.current.value++
            setLibrary(readLibrary())
            setError('')
            setDeleting(false)
          }}
        >
          Reload construction presets
        </Button>
        <label className="block">
          Preset name
          <input
            aria-label="Construction preset name"
            className="border rounded px-2 block w-full"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          Description
          <textarea
            aria-label="Construction preset description"
            className="border rounded px-2 block w-full"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!library.ready || stale || !name.trim()}
          onClick={() => capture(false)}
        >
          Save construction preset
        </Button>
        <label className="block">
          Search presets
          <input
            aria-label="Search construction presets"
            className="border rounded px-2 block w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="block">
          Sort presets
          <select
            aria-label="Sort construction presets"
            className="border rounded ml-2"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Name</option>
            <option value="recent">Recently updated</option>
          </select>
        </label>
        <p>
          {visible.length} of {library.entries.length} construction presets
        </p>
        <ul className="max-h-44 overflow-y-auto">
          {visible.map((p) => (
            <li key={p.id}>
              <button
                className="border rounded p-2 mb-1 w-full text-left"
                aria-pressed={p.id === selected}
                onClick={() => choose(p)}
              >
                {p.name}
                <span className="block">{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
        {entry && (
          <>
            <p>
              Saved {new Date(entry.createdAt).toLocaleString()} · Updated{' '}
              {new Date(entry.updatedAt).toLocaleString()}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                disabled={!library.ready || !name.trim()}
                onClick={() => {
                  if (
                    write((current) =>
                      current.map((p) =>
                        p.id === entry.id
                          ? {
                              ...p,
                              name: name.trim(),
                              description: description.trim(),
                              updatedAt: Date.now(),
                            }
                          : p,
                      ),
                    )
                  )
                    setStatus('Preset name and description updated.')
                }}
              >
                Update preset details
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!library.ready || stale || !name.trim()}
                onClick={() => capture(true)}
              >
                Replace preset from draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!library.ready}
                onClick={() => {
                  const entries = write((current) =>
                    appendConstructionPresets(current, [
                      {
                        ...entry,
                        name: `${entry.name.slice(0, 70)} copy`,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      },
                    ]),
                  )
                  if (entries) {
                    choose(entries.at(-1)!)
                    setStatus('Construction preset duplicated.')
                  }
                }}
              >
                Duplicate construction preset
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!library.ready}
                onClick={() => setDeleting(true)}
              >
                Delete construction preset
              </Button>
            </div>
            {deleting && (
              <div>
                <p>Delete “{entry.name}” from this browser?</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (write((current) => current.filter((p) => p.id !== entry.id))) {
                      setSelected(null)
                      setStatus('Construction preset deleted.')
                    }
                  }}
                >
                  Confirm delete preset
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeleting(false)}>
                  Cancel delete preset
                </Button>
              </div>
            )}
            <fieldset className="border rounded p-2">
              <legend>Settings to reuse</legend>
              {(Object.keys(CONSTRUCTION_GROUPS) as ConstructionGroup[]).map((group) => (
                <label className="block" key={group}>
                  <input
                    type="checkbox"
                    checked={groups.includes(group)}
                    onChange={(e) =>
                      setGroups((current) =>
                        e.target.checked ? [...current, group] : current.filter((g) => g !== group),
                      )
                    }
                  />{' '}
                  {labels[group]}
                </label>
              ))}
            </fieldset>
            <table className="text-left w-full">
              <caption>Saved construction settings</caption>
              <tbody>
                {Object.entries(entry.settings).map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row">{settingLabels[key as PresetKey]}</th>
                    <td>{displaySetting(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {missing.length > 0 && (
              <p role="alert">
                Unavailable panel materials: {missing.join(', ')}. Stage, then replace these names
                in the construction draft, or deselect Panel materials.
              </p>
            )}
            <table className="text-left w-full">
              <caption>Preset differences from draft</caption>
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Draft</th>
                  <th>Preset</th>
                </tr>
              </thead>
              <tbody>
                {differences.map((d) => (
                  <tr key={d.key}>
                    <th scope="row">{settingLabels[d.key]}</th>
                    <td>{displaySetting(d.before)}</td>
                    <td>{displaySetting(d.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!differences.length && <p>No selected settings differ from the draft.</p>}
            <Button
              size="sm"
              disabled={stale || !differences.length}
              onClick={() => {
                onStage(next)
                setStatus(
                  'Preset staged. Preview construction to validate the destination cabinet.',
                )
                setError('')
              }}
            >
              Stage construction preset
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportEntries([entry], 'construction-preset.json')}
            >
              Export selected construction preset
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!library.entries.length}
          onClick={() => exportEntries(library.entries, 'construction-presets.json')}
        >
          Export construction preset library
        </Button>
        <label className="block">
          Import construction preset JSON
          <input
            aria-label="Import construction preset JSON"
            type="file"
            accept=".json,application/json"
            disabled={!library.ready}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const request = ++generation.current.value
              try {
                if (file.size > PRESET_FILE_LIMIT)
                  throw Error('Preset JSON must be 256 KiB or smaller.')
                const incoming = parseConstructionPresets(await file.text())
                if (request !== generation.current.value) return
                if (!incoming.length) throw Error('The file contains no construction presets.')
                const entries = write((current) => appendConstructionPresets(current, incoming))
                if (entries) {
                  choose(entries[entries.length - incoming.length])
                  setStatus(`${incoming.length} construction presets imported.`)
                }
              } catch (cause) {
                if (request === generation.current.value) setError(message(cause))
              }
            }}
          />
        </label>
      </section>
    </details>
  )
}
