import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionElevation } from './SectionElevation'
import { downloadBlob } from './download'
import { findOpening, openingLayoutErrors } from '../scene/openingLayouts'
import { pasteOpening } from '../scene/openingReuse'
import { overridesOf } from '../scene/resolveThickness'
import {
  appendLayouts,
  LAYOUT_FILE_LIMIT,
  LAYOUT_LIBRARY_KEY,
  layoutSummary,
  parseLayoutLibrary,
  savedLayout,
  serializeLayoutLibrary,
  type SavedCabinetLayout,
} from '../scene/cabinetLayoutLibrary'
import type {
  CarcaseComponent,
  CarcaseParams,
  Component,
  MaterialDef,
  Part,
  SectionId,
} from '../scene/types'

type LibraryState = {
  entries: SavedCabinetLayout[]
  raw: string | null
  ready: boolean
  error: string
}
function readLibrary(): LibraryState {
  try {
    const raw = localStorage.getItem(LAYOUT_LIBRARY_KEY)
    return { entries: raw === null ? [] : parseLayoutLibrary(raw), raw, ready: true, error: '' }
  } catch (error) {
    return {
      entries: [],
      raw: null,
      ready: false,
      error: `Could not load the local layout library: ${error instanceof Error ? error.message : 'Storage is unavailable.'} Stored data has not been replaced.`,
    }
  }
}
interface LayoutPreview {
  cabinetId: string
  base: CarcaseParams
  target: SectionId
  entry: SavedCabinetLayout
  next: CarcaseParams
  materials: Record<string, MaterialDef>
  overrides: string
  selection: SectionId | null
  errors: string[]
}
export function CabinetLayoutLibrary({
  cabinet,
  materials,
  parts,
  components,
  selected,
  onUpdate,
  onSelect,
}: {
  cabinet: CarcaseComponent
  materials: Record<string, MaterialDef>
  parts: Part[]
  components: Component[]
  selected: SectionId | null
  onUpdate: (updater: (c: Component) => Component, historyLabel?: string) => void
  onSelect: (id: SectionId) => void
}) {
  const [library, setLibrary] = useState(readLibrary)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [scope, setScope] = useState<'opening' | 'cabinet'>('opening')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [preview, setPreview] = useState<LayoutPreview | null>(null)
  const importRequest = useRef({ generation: 0 })
  const entry = library.entries.find((item) => item.id === selectedId)
  const target = scope === 'cabinet' ? cabinet.params.section.id : selected
  const opening = selected ? findOpening(cabinet.params.section, selected) : null
  const overrides = JSON.stringify(
    [...overridesOf(parts, cabinet.id)].sort(([a], [b]) => a.localeCompare(b)),
  )
  if (
    preview &&
    (preview.cabinetId !== cabinet.id ||
      preview.base !== cabinet.params ||
      preview.materials !== materials ||
      preview.overrides !== overrides ||
      preview.entry !== entry ||
      preview.target !== target ||
      preview.selection !== selected)
  )
    setPreview(null)
  useEffect(() => {
    const requests = importRequest.current
    const refresh = (event: StorageEvent) => {
      if (event.key === LAYOUT_LIBRARY_KEY || event.key === null) {
        setLibrary(readLibrary())
        setPreview(null)
        setMessage('Local layout library refreshed.')
        setDeleting(null)
      }
    }
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      requests.generation++
    }
  }, [])
  const write = (
    change: (entries: SavedCabinetLayout[]) => SavedCabinetLayout[],
  ): SavedCabinetLayout[] | null => {
    setError('')
    setMessage('')
    try {
      if (!library.ready) throw Error('Reload the local library before editing it.')
      if (localStorage.getItem(LAYOUT_LIBRARY_KEY) !== library.raw) {
        setLibrary(readLibrary())
        setPreview(null)
        throw Error(
          'The library changed in another tab. It has been refreshed; try your change again.',
        )
      }
      const entries = change(library.entries),
        raw = serializeLayoutLibrary(entries)
      localStorage.setItem(LAYOUT_LIBRARY_KEY, raw)
      setLibrary({ entries, raw, ready: true, error: '' })
      setPreview(null)
      setDeleting(null)
      return entries
    } catch (cause) {
      setError(
        `Layout library change was not saved: ${cause instanceof Error ? cause.message : 'Storage is unavailable.'}`,
      )
      return null
    }
  }
  const save = (whole: boolean) => {
    const section = whole ? cabinet.params.section : opening
    if (!section) return
    try {
      const item = savedLayout(name, section, cabinet.params)
      const entries = write((current) => appendLayouts(current, [item]))
      if (entries) {
        setSelectedId(entries.at(-1)!.id)
        setName(entries.at(-1)!.name)
        setMessage('Layout saved locally.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save layout.')
    }
  }
  const exportEntries = (entries: SavedCabinetLayout[], filename: string) => {
    try {
      downloadBlob(serializeLayoutLibrary(entries), filename, 'application/json')
      setError('')
      setMessage('Layout JSON exported.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export layouts.')
    }
  }
  const visible = library.entries
    .filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'oldest'
          ? a.createdAt - b.createdAt
          : b.updatedAt - a.updatedAt,
    )
  return (
    <details className="border-t pt-2 text-[11px]" aria-label="Personal cabinet layout library">
      <summary className="cursor-pointer font-medium">Personal layout library</summary>
      <section aria-label="Saved cabinet layouts" className="flex flex-col gap-2 pt-2">
        <p>
          Save divisions, fronts and shelving. Independent face-frame layouts, drawer settings and
          board overrides are not saved. Destination dimensions and materials stay in place. Layouts
          are stored in this browser; export JSON to keep a portable copy.
        </p>
        {(error || library.error) && <p role="alert">{error || library.error}</p>}
        {message && <p role="status">{message}</p>}
        {!library.ready && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLibrary(readLibrary())
              setError('')
            }}
          >
            Reload local layouts
          </Button>
        )}
        <label>
          Layout name
          <input
            aria-label="Layout name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-1"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!library.ready || !name.trim() || !opening}
          onClick={() => save(false)}
        >
          Save selected opening
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!library.ready || !name.trim()}
          onClick={() => save(true)}
        >
          Save cabinet layout
        </Button>
        <label>
          Search layouts
          <input
            aria-label="Search layouts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border rounded px-1"
          />
        </label>
        <label>
          Sort layouts
          <select
            aria-label="Sort layouts"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full border rounded"
          >
            <option value="name">Name</option>
            <option value="newest">Recently updated</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <p>
          {visible.length} of {library.entries.length} saved layouts
        </p>
        <ul className="max-h-44 overflow-y-auto">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                className="text-left w-full border rounded p-1 mb-1"
                aria-pressed={selectedId === item.id}
                onClick={() => {
                  setSelectedId(item.id)
                  setName(item.name)
                  setPreview(null)
                  setDeleting(null)
                }}
              >
                {item.name}
                <span className="block">{layoutSummary(item.section)}</span>
              </button>
            </li>
          ))}
        </ul>
        {entry && (
          <>
            <p>
              Saved from {entry.source.width} × {entry.source.height} × {entry.source.depth} mm
              (width × height × depth).
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!library.ready || !name.trim()}
              onClick={() => {
                const renamed = name.trim()
                const entries = write((current) =>
                  current.map((item) =>
                    item.id === entry.id ? { ...item, name: renamed, updatedAt: Date.now() } : item,
                  ),
                )
                if (entries) setMessage('Layout renamed.')
              }}
            >
              Rename saved layout
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!library.ready}
              onClick={() => {
                const entries = write((current) =>
                  appendLayouts(current, [
                    {
                      ...entry,
                      name: `${entry.name.slice(0, 70)} copy`,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    },
                  ]),
                )
                if (entries) {
                  setSelectedId(entries.at(-1)!.id)
                  setName(entries.at(-1)!.name)
                  setMessage('Layout duplicated.')
                }
              }}
            >
              Duplicate saved layout
            </Button>
            {deleting === entry.id ? (
              <>
                <p>Delete “{entry.name}” from this browser library?</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (write((current) => current.filter((item) => item.id !== entry.id))) {
                      setSelectedId(null)
                      setMessage('Layout deleted.')
                    }
                  }}
                >
                  Confirm delete layout
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeleting(null)}>
                  Cancel delete layout
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!library.ready}
                onClick={() => setDeleting(entry.id)}
              >
                Delete saved layout
              </Button>
            )}
          </>
        )}
        <label>
          Apply layout to
          <select
            aria-label="Apply layout to"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as 'opening' | 'cabinet')
              setPreview(null)
            }}
            className="w-full border rounded"
          >
            <option value="opening">Selected opening</option>
            <option value="cabinet">Whole cabinet</option>
          </select>
        </label>
        <p>
          Applying replaces the target's divisions, fronts, shelving and independent face-frame
          layouts. Drawer settings and board overrides are not copied.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={!entry || !target || !findOpening(cabinet.params.section, target)}
          onClick={() => {
            if (!entry || !target) return
            const next = pasteOpening(cabinet.params, target, entry.section, 'layout')
            setPreview({
              cabinetId: cabinet.id,
              base: cabinet.params,
              target,
              entry,
              next,
              materials,
              overrides,
              selection: selected,
              errors: openingLayoutErrors(
                next,
                target,
                materials,
                parts,
                cabinet.id,
                components.filter((c) => c.kind === 'drawer'),
              ),
            })
            setError('')
            setMessage('')
          }}
        >
          Preview saved layout
        </Button>
        {preview && (
          <section aria-label="Saved layout preview" className="border rounded p-1">
            <p>
              {preview.entry.name} · {scope === 'cabinet' ? 'Whole cabinet' : 'Selected opening'}
            </p>
            {preview.errors.length ? (
              <div role="alert">{preview.errors.join('; ')}</div>
            ) : (
              <div className="h-44 pointer-events-none" aria-label="Proposed cabinet elevation">
                <SectionElevation
                  params={preview.next}
                  materials={materials}
                  parts={parts}
                  componentId={cabinet.id}
                  selected={preview.target}
                  onSelect={() => {}}
                />
              </div>
            )}
            <Button
              size="sm"
              disabled={preview.errors.length > 0}
              onClick={() => {
                onUpdate(
                  (c) =>
                    c.kind === 'carcase' && c.id === cabinet.id && c.params === preview.base
                      ? { ...c, params: preview.next }
                      : c,
                  'Apply saved cabinet layout',
                )
                onSelect(preview.target)
                setPreview(null)
              }}
            >
              Apply saved layout
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
              Cancel saved layout preview
            </Button>
          </section>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!entry}
          onClick={() => entry && exportEntries([entry], 'cabinet-layout.json')}
        >
          Export selected layout
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!library.entries.length}
          onClick={() => exportEntries(library.entries, 'cabinet-layout-library.json')}
        >
          Export layout library
        </Button>
        <label>
          Import layout JSON
          <input
            aria-label="Import layout JSON"
            type="file"
            accept=".json,application/json"
            disabled={!library.ready}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const request = ++importRequest.current.generation
              try {
                if (file.size > LAYOUT_FILE_LIMIT)
                  throw Error('Layout files must be 512 KiB or smaller.')
                const incoming = parseLayoutLibrary(await file.text())
                if (request !== importRequest.current.generation) return
                if (!incoming.length) throw Error('The file contains no saved layouts.')
                const entries = write((current) => appendLayouts(current, incoming))
                if (entries) {
                  setSelectedId(entries[library.entries.length].id)
                  setName(entries[library.entries.length].name)
                  setMessage(`${incoming.length} layouts imported.`)
                }
              } catch (cause) {
                if (request === importRequest.current.generation)
                  setError(cause instanceof Error ? cause.message : 'Could not import layouts.')
              }
            }}
          />
        </label>
      </section>
    </details>
  )
}
