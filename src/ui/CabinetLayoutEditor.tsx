import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { PLACEMENT_ALIGNMENTS, placementSignature } from '../scene/placementTools'
import {
  layoutCabinets,
  layoutDraft,
  previewLayout,
  sortLayout,
  stageLayout,
  type LayoutAction,
  type LayoutAxis,
  type LayoutDraft,
  type LayoutPreview,
} from '../scene/layoutTools'
import { PlanView } from './PlanView'

const AXES = ['x', 'y', 'z'] as const
export function CabinetLayoutEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: LayoutPreview) => boolean
}) {
  const signature = placementSignature(scene)
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState(() => layoutDraft(scene, [cabinet.id]))
  const [gap, setGap] = useState('0')
  const [offset, setOffset] = useState({ x: '0', y: '0', z: '0' })
  const [sortAxis, setSortAxis] = useState<LayoutAxis>('x')
  const [preview, setPreview] = useState<LayoutPreview | null>(null)
  const [error, setError] = useState('')
  const stale = base !== signature
  if (preview && preview.signature !== signature) setPreview(null)
  const siblings = layoutCabinets(scene, cabinet.parentId)
  const names = new Map(siblings.map((c) => [c.id, c.label]))
  const locked = siblings.some((c) => draft.ids.includes(c.id) && c.anchor) && !draft.detach
  const clearPreview = () => {
    setPreview(null)
    setError('')
  }
  const update = (next: LayoutDraft) => {
    setDraft(next)
    clearPreview()
  }
  const select = (ids: string[]) => {
    // Selection changes start fresh so an old operation cannot silently affect a newly chosen set.
    update(ids.length ? layoutDraft(scene, ids) : { ids: [], positions: {}, detach: false })
  }
  const reset = () => {
    setBase(signature)
    select([cabinet.id])
    setOffset({ x: '0', y: '0', z: '0' })
    setGap('0')
  }
  const perform = (operation: () => LayoutDraft) => {
    try {
      update(operation())
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : 'Layout action failed.')
    }
  }
  const action = (value: LayoutAction) => perform(() => stageLayout(scene, draft, value))
  const reorder = (index: number, direction: -1 | 1) => {
    const ids = [...draft.ids]
    ;[ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]
    update({ ...draft, ids })
  }
  const disabled = stale || locked
  return (
    <section
      aria-label="Multi-cabinet layout editor"
      className="text-xs max-w-5xl mx-auto space-y-4"
    >
      <p>
        Arrange sibling cabinets in their shared parent coordinate frame. The first selected cabinet
        is the fixed reference for runs and alignments. Distribution uses geometric order and fixes
        the outer cabinets.
      </p>
      <p>
        Occupied envelopes include fronts, frames and applied backs from material slots; individual
        board overrides do not change these envelopes. Drafts are discarded when leaving this tab.
        Changing selection resets staged placements.
      </p>
      {stale && (
        <p role="alert">
          Cabinet geometry, placement or materials changed. Reset the layout draft before
          continuing.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={stale} className="border rounded p-3 space-y-2">
        <legend>Layout selection</legend>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => select(siblings.map((c) => c.id))}>
            Select all sibling cabinets
          </Button>
          <Button size="sm" variant="outline" onClick={() => select([])}>
            Clear layout selection
          </Button>
        </div>
        {siblings.map((c) => (
          <label key={c.id} className="block">
            <input
              type="checkbox"
              aria-label={`Include ${c.label} (${c.id})`}
              checked={draft.ids.includes(c.id)}
              onChange={(e) =>
                select(
                  e.target.checked ? [...draft.ids, c.id] : draft.ids.filter((id) => id !== c.id),
                )
              }
            />{' '}
            {c.label} ({c.id}){c.anchor ? ' — anchored' : ''}
          </label>
        ))}
      </fieldset>
      <section aria-label="Selected cabinet order">
        <p>{draft.ids.length} selected. Reordering keeps staged positions.</p>
        <ol>
          {draft.ids.map((id, index) => (
            <li key={id} className="flex items-center gap-2 mb-1">
              <span>
                {index + 1}. {names.get(id) ?? id}
                {index === 0 ? ' — reference' : ''}
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move ${id} earlier`}
                disabled={stale || index === 0}
                onClick={() => reorder(index, -1)}
              >
                Earlier
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move ${id} later`}
                disabled={stale || index === draft.ids.length - 1}
                onClick={() => reorder(index, 1)}
              >
                Later
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={stale || draft.ids.length < 2}
            onClick={() => update({ ...draft, ids: [...draft.ids].reverse() })}
          >
            Reverse layout order
          </Button>
          <label>
            Sort axis{' '}
            <select
              aria-label="Layout sort axis"
              value={sortAxis}
              onChange={(e) => {
                setSortAxis(e.target.value as LayoutAxis)
                clearPreview()
              }}
            >
              {AXES.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={stale || !draft.ids.length}
            onClick={() => perform(() => sortLayout(scene, draft, sortAxis))}
          >
            Sort layout order
          </Button>
        </div>
      </section>
      <label className="block">
        <input
          type="checkbox"
          checked={draft.detach}
          disabled={stale}
          onChange={(e) => update({ ...draft, detach: e.target.checked })}
        />{' '}
        Detach selected anchors when applying
      </label>
      {locked && (
        <p>
          Selected anchored cabinets require explicit detachment. Unselected followers remain linked
          and move in preview.
        </p>
      )}
      <fieldset disabled={disabled} className="border rounded p-3 space-y-2">
        <legend>Move selection</legend>
        <div className="grid grid-cols-3 gap-3">
          {AXES.map((axis) => (
            <label key={axis}>
              Offset {axis.toUpperCase()} (mm)
              <input
                className="block border rounded p-1 w-full"
                aria-label={`Layout offset ${axis.toUpperCase()}`}
                type="number"
                step="any"
                value={offset[axis]}
                onChange={(e) => {
                  setOffset({ ...offset, [axis]: e.target.value })
                  clearPreview()
                }}
              />
            </label>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!draft.ids.length}
          onClick={() => action({ kind: 'move', offset })}
        >
          Stage selection move
        </Button>
      </fieldset>
      <fieldset
        disabled={disabled || draft.ids.length < 2}
        className="border rounded p-3 space-y-2"
      >
        <legend>Arrange and align</legend>
        <label>
          Run gap (mm)
          <input
            aria-label="Layout run gap"
            type="number"
            min="0"
            step="any"
            value={gap}
            onChange={(e) => {
              setGap(e.target.value)
              clearPreview()
            }}
            className="border rounded p-1 ml-2"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {AXES.map((axis) => (
            <Button
              key={axis}
              size="sm"
              variant="outline"
              onClick={() => action({ kind: 'run', axis, gap })}
            >
              Arrange along {axis.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {PLACEMENT_ALIGNMENTS.map(([alignment, label]) => (
            <Button
              key={alignment}
              size="sm"
              variant="outline"
              onClick={() => action({ kind: 'align', alignment })}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {AXES.map((axis) => (
            <Button
              key={axis}
              size="sm"
              variant="outline"
              disabled={draft.ids.length < 3}
              onClick={() => action({ kind: 'distribute', axis })}
            >
              Distribute gaps along {axis.toUpperCase()}
            </Button>
          ))}
        </div>
      </fieldset>
      <section aria-label="Staged cabinet positions">
        <table className="w-full text-left">
          <caption>Staged positions (mm)</caption>
          <thead>
            <tr>
              <th>Cabinet</th>
              {AXES.map((a) => (
                <th key={a}>{a.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.ids.map((id) => (
              <tr key={id}>
                <th>
                  {names.get(id)} ({id})
                </th>
                {AXES.map((a) => (
                  <td key={a} data-testid={`layout-${id}-${a}`}>
                    {draft.positions[id]?.[a].toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={disabled || !draft.ids.length}
          onClick={() => {
            clearPreview()
            setPreview(previewLayout(scene, draft))
          }}
        >
          Preview cabinet layout
        </Button>
        <Button
          size="sm"
          disabled={stale || !preview?.scene || !preview.changed || preview.errors.length > 0}
          onClick={() => {
            if (!preview || !onApply(preview)) {
              setError('The project changed after preview. Reset and preview again.')
              setPreview(null)
              return
            }
            const next = preview.scene!
            setBase(placementSignature(next))
            setDraft(layoutDraft(next, draft.ids))
            clearPreview()
          }}
        >
          Apply cabinet layout
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset layout draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel layout changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Cabinet layout preview" className="space-y-3">
          {preview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {!preview.errors.length && !preview.changed && <p>No staged layout changes.</p>}
          {preview.scene && (
            <>
              <div className="pointer-events-none" aria-label="Layout plan preview">
                <PlanView
                  scene={preview.scene}
                  selectedId={null}
                  onSelect={() => {}}
                  onDrop={() => {}}
                  onTurn={() => {}}
                  warnings={[]}
                  cabinetIds={new Set(siblings.map((c) => c.id))}
                />
              </div>
              {preview.overlaps.length ? (
                <section aria-label="Layout overlap warnings">
                  <p>
                    Occupied envelopes overlap. These conservative 3D bounds may overstate overlap
                    for rotated cabinets. Intentional placement can be applied.
                  </p>
                  <ul>
                    {preview.overlaps.map((o, i) => (
                      <li key={i}>
                        {o.a} ↔ {o.b}: {o.x.toFixed(1)} × {o.y.toFixed(1)} × {o.z.toFixed(1)} mm
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p>No occupied-envelope overlaps among sibling cabinets.</p>
              )}
            </>
          )}
        </section>
      )}
    </section>
  )
}
