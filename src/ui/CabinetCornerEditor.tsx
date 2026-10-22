import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardPart, CarcaseComponent, EdgeKey, Scene } from '../scene/types'
import type { CornerDraft, CornerLeg } from '../scene/cornerRecipe'
import {
  cornerCandidates,
  cornerDraft,
  cornerIssues,
  previewCorner,
  type CornerPreview,
} from '../scene/cornerPanels'
import { finishingMaterials } from '../scene/finishingPanels'
import { anchoredRunMembers } from '../scene/runWorktops'

export function CabinetCornerEditor({
  scene,
  cabinet,
  onApply,
}: {
  scene: Scene
  cabinet: CarcaseComponent
  onApply: (p: CornerPreview) => boolean
}) {
  const [draft, setDraft] = useState(() => cornerDraft(scene, cabinet.id))
  const [base, setBase] = useState(() => JSON.stringify(scene))
  const [target, setTarget] = useState<string>()
  const [preview, setPreview] = useState<CornerPreview | null>(null)
  const [message, setMessage] = useState('')
  const [candidates, setCandidates] = useState<CornerDraft[]>([])
  const stale = base !== JSON.stringify(scene)
  const patch = (change: Partial<CornerDraft>) => {
    setDraft((d) => ({ ...d, ...change }))
    setPreview(null)
    setMessage('')
    setCandidates([])
  }
  const legPatch = (index: number, change: Partial<CornerLeg>) =>
    patch({
      legs: draft.legs.map((l, i) =>
        i === index ? { ...l, ...change } : l,
      ) as CornerDraft['legs'],
    })
  const reset = () => {
    setDraft(cornerDraft(scene, cabinet.id))
    setBase(JSON.stringify(scene))
    setTarget(undefined)
    setPreview(null)
    setMessage('')
    setCandidates([])
  }
  const saved = [
    ...new Map(
      scene.parts
        .filter((p): p is BoardPart => p.kind === 'board' && !!p.cornerPanel)
        .map((p) => [p.cornerPanel!.assemblyId, p]),
    ).values(),
  ]
  const apply = (p: CornerPreview) => {
    if (!onApply(p)) {
      setMessage('The project changed. Reload and preview again.')
      setPreview(null)
      return
    }
    setPreview(null)
    setMessage(
      p.action === 'delete'
        ? 'Corner assembly deleted.'
        : p.action === 'detach'
          ? 'Corner assembly detached; boards now have fixed dimensions.'
          : 'Corner assembly applied. Reset or reload to continue.',
    )
  }
  const cabinets = scene.components.filter(
    (c): c is CarcaseComponent => c.kind === 'carcase' && c.parentId === cabinet.parentId,
  )
  const edgeMaterials = Object.entries(scene.materials)
    .filter(([, m]) => Number.isFinite(m.thickness) && m.thickness! > 0)
    .map(([name]) => name)
  const numeric = [
    ['left', 'Left extension'],
    ['right', 'Right extension'],
    ['front', 'Front overhang'],
    ['rear', 'Rear overhang'],
    ['bottom', 'Vertical gap'],
    ['maxGap', 'Allowed cabinet gap'],
    ['thickness', 'Custom thickness'],
    ['height', 'Panel height'],
    ['setback', 'Setback / rear clearance'],
  ] as const
  return (
    <section aria-label="Corner assembly editor" className="space-y-4 text-xs">
      <p>
        Join two perpendicular cabinet runs with separate rectangular boards and a square butt
        joint. Review support, coverage and installation clearances before manufacturing. Assembly
        dimensions and edge treatments are edited here; detach the assembly for normal part edits.
      </p>
      <section aria-label="Saved corner assemblies">
        {saved.map((part) => (
          <div key={part.cornerPanel!.assemblyId} className="border rounded p-2">
            <p>{part.cornerPanel!.draft.label}</p>
            {cornerIssues(scene, part.cornerPanel!.assemblyId).map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(structuredClone(part.cornerPanel!.draft))
                setTarget(part.cornerPanel!.assemblyId)
                setBase(JSON.stringify(scene))
                setPreview(null)
                setMessage('')
              }}
            >
              Edit {part.cornerPanel!.draft.label}
            </Button>
            {(['detach', 'delete'] as const).map((action) => (
              <Button
                key={action}
                size="sm"
                variant="outline"
                onClick={() =>
                  apply({
                    ...previewCorner(scene, part.cornerPanel!.draft, part.cornerPanel!.assemblyId),
                    action,
                  })
                }
              >
                {action === 'detach' ? 'Detach' : 'Delete'} {part.cornerPanel!.draft.label}
              </Button>
            ))}
          </div>
        ))}
      </section>
      {message && <p role="status">{message}</p>}
      {stale && (
        <p role="alert">The project changed. Reset or reload the assembly before continuing.</p>
      )}
      <fieldset disabled={stale} className="space-y-3">
        <legend>Corner assembly settings</legend>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const found = cornerCandidates(scene, draft)
            setCandidates(found)
            setMessage(
              found.length
                ? 'Choose a detected perpendicular run pair.'
                : 'No compatible end corner found. Select both legs manually or adjust cabinet placement.',
            )
          }}
        >
          Find corner runs
        </Button>
        {candidates.map((candidate, i) => (
          <Button
            key={i}
            size="sm"
            variant="outline"
            onClick={() => {
              patch(candidate)
              setCandidates([])
            }}
          >
            Use corner with{' '}
            {candidate.legs[1].run.memberIds
              .map((id) => scene.components.find((c) => c.id === id)?.label ?? id)
              .join(', ')}
          </Button>
        ))}

        <label className="block">
          Assembly name{' '}
          <input
            aria-label="Assembly name"
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
        <label className="block">
          Profile{' '}
          <select
            aria-label="Corner profile"
            value={draft.legs[0].run.profile ?? 'worktop'}
            onChange={(e) => {
              const fresh = cornerDraft(
                scene,
                cabinet.id,
                e.target.value === 'worktop'
                  ? undefined
                  : (e.target.value as 'plinth' | 'splashback'),
              )
              patch({
                legs: fresh.legs.map((l, i) => ({
                  ...l,
                  run: { ...l.run, memberIds: draft.legs[i].run.memberIds },
                })) as CornerDraft['legs'],
              })
            }}
          >
            <option value="worktop">Worktop</option>
            <option value="plinth">Plinth</option>
            <option value="splashback">Splashback</option>
          </select>
        </label>
        <label className="block">
          Through leg{' '}
          <select
            aria-label="Through leg"
            value={draft.through}
            onChange={(e) => patch({ through: Number(e.target.value) as 0 | 1 })}
          >
            <option value="0">Leg 1</option>
            <option value="1">Leg 2</option>
          </select>
        </label>
        <label className="block">
          Joint clearance (mm){' '}
          <input
            aria-label="Joint clearance"
            type="number"
            min="0"
            step="any"
            value={draft.gap}
            onChange={(e) => patch({ gap: e.target.value })}
          />
        </label>
        {draft.legs.map((leg, index) => (
          <fieldset
            key={index}
            aria-label={`Corner leg ${index + 1}`}
            className="border rounded p-2 space-y-2"
          >
            <legend>Leg {index + 1}</legend>
            {cabinets.map((c) => (
              <label key={c.id} className="block">
                <input
                  aria-label={`Leg ${index + 1}: ${c.label}`}
                  type="checkbox"
                  checked={leg.run.memberIds.includes(c.id)}
                  onChange={(e) =>
                    legPatch(index, {
                      run: {
                        ...leg.run,
                        memberIds: e.target.checked
                          ? [...leg.run.memberIds, c.id]
                          : leg.run.memberIds.filter((id) => id !== c.id),
                      },
                    })
                  }
                />{' '}
                {c.label}
              </label>
            ))}
            {leg.run.memberIds
              .filter((id) => !cabinets.some((c) => c.id === id))
              .map((id) => (
                <label className="block" key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      legPatch(index, {
                        run: { ...leg.run, memberIds: leg.run.memberIds.filter((x) => x !== id) },
                      })
                    }
                  />
                  Missing cabinet: {id}
                </label>
              ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                legPatch(index, {
                  run: {
                    ...leg.run,
                    memberIds: anchoredRunMembers(
                      scene,
                      leg.run.memberIds.find((id) => cabinets.some((c) => c.id === id)) ??
                        cabinet.id,
                    ),
                  },
                })
              }
            >
              Select anchored run for leg {index + 1}
            </Button>
            <label className="block">
              Material{' '}
              <select
                aria-label={`Leg ${index + 1} material`}
                value={leg.run.material}
                onChange={(e) => legPatch(index, { run: { ...leg.run, material: e.target.value } })}
              >
                {finishingMaterials(scene).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Grain{' '}
              <select
                aria-label={`Leg ${index + 1} grain`}
                value={leg.run.grain}
                onChange={(e) =>
                  legPatch(index, {
                    run: { ...leg.run, grain: e.target.value as typeof leg.run.grain },
                  })
                }
              >
                {['length', 'width', 'free'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Thickness source{' '}
              <select
                aria-label={`Leg ${index + 1} thickness source`}
                value={leg.run.thicknessMode}
                onChange={(e) =>
                  legPatch(index, {
                    run: { ...leg.run, thicknessMode: e.target.value as 'stock' | 'custom' },
                  })
                }
              >
                <option value="stock">Stock thickness</option>
                <option value="custom">Custom thickness</option>
              </select>
            </label>
            {leg.run.profile === 'plinth' && (
              <label className="block">
                Height source{' '}
                <select
                  aria-label={`Leg ${index + 1} height source`}
                  value={leg.run.heightMode}
                  onChange={(e) =>
                    legPatch(index, {
                      run: { ...leg.run, heightMode: e.target.value as 'toe-kick' | 'custom' },
                    })
                  }
                >
                  <option value="toe-kick">Toe kick</option>
                  <option value="custom">Custom height</option>
                </select>
              </label>
            )}
            {numeric
              .filter(([key]) => leg.run[key] !== undefined)
              .map(([key, label]) => (
                <label key={key} className="block">
                  {label} (mm){' '}
                  <input
                    aria-label={`Leg ${index + 1} ${label.toLowerCase()}`}
                    type="number"
                    min="0"
                    step="any"
                    disabled={
                      (key === 'thickness' && leg.run.thicknessMode === 'stock') ||
                      (key === 'height' && leg.run.heightMode === 'toe-kick')
                    }
                    value={leg.run[key]}
                    onChange={(e) =>
                      legPatch(index, { run: { ...leg.run, [key]: e.target.value } })
                    }
                  />
                </label>
              ))}
            {leg.run.profile && (
              <label className="block">
                <input
                  type="checkbox"
                  checked={leg.endReturn}
                  onChange={(e) => legPatch(index, { endReturn: e.target.checked })}
                />
                Add exposed end return for leg {index + 1}
              </label>
            )}
            {(['x0', 'x1', 'y0', 'y1'] as EdgeKey[]).map((key) => (
              <label className="block" key={key}>
                Local edge {key}{' '}
                <select
                  aria-label={`Leg ${index + 1} edge ${key}`}
                  value={
                    leg.edges[key] === undefined
                      ? 'inherit'
                      : leg.edges[key] === null
                        ? 'bare'
                        : `stock:${leg.edges[key]}`
                  }
                  onChange={(e) => {
                    const edges = { ...leg.edges }
                    if (e.target.value === 'inherit') delete edges[key]
                    else edges[key] = e.target.value === 'bare' ? null : e.target.value.slice(6)
                    legPatch(index, { edges })
                  }}
                >
                  <option value="inherit">Inherit</option>
                  <option value="bare">Bare</option>
                  {edgeMaterials.map((m) => (
                    <option key={m} value={`stock:${m}`}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        ))}
        <Button
          size="sm"
          onClick={() => {
            setPreview(previewCorner(scene, draft, target))
            setMessage('')
          }}
        >
          Preview corner assembly
        </Button>
        <Button
          size="sm"
          disabled={stale || !preview || !!preview.errors.length || !preview.changed}
          onClick={() => preview && apply(preview)}
        >
          Apply corner assembly
        </Button>
      </fieldset>
      <Button size="sm" variant="outline" onClick={reset}>
        Reset corner draft
      </Button>
      <Button size="sm" variant="outline" onClick={reset}>
        Cancel corner changes
      </Button>
      {preview && (
        <section aria-label="Corner assembly preview">
          {preview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {!preview.errors.length && (
            <>
              <p>
                Square butt joint · through leg {draft.through + 1} · clearance {draft.gap} mm
              </p>
              <table aria-label="Corner board dimensions">
                <thead>
                  <tr>
                    <th>Board</th>
                    <th>Length</th>
                    <th>Width</th>
                    <th>Thickness</th>
                    <th>Material</th>
                    <th>Grain</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.parts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td>{p.length.toFixed(2)}</td>
                      <td>{p.width.toFixed(2)}</td>
                      <td>{p.thickness.toFixed(2)}</td>
                      <td>{p.material}</td>
                      <td>{p.grain}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CornerPlan preview={preview} />
              <ul aria-label="Corner review issues">
                {preview.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              {!preview.changed && <p>No changes to save.</p>}
            </>
          )}
        </section>
      )}
    </section>
  )
}
function CornerPlan({ preview }: { preview: CornerPreview }) {
  const b = preview.boxes
  if (!b.length) return null
  const x0 = Math.min(...b.map((b) => b.x0)) - 30,
    y0 = Math.min(...b.map((b) => b.y0)) - 30
  const width = Math.max(...b.map((b) => b.x1)) - x0 + 30,
    height = Math.max(...b.map((b) => b.y1)) - y0 + 30
  return (
    <svg
      role="img"
      aria-label="Corner joint plan preview"
      viewBox={`${x0} ${y0} ${width} ${height}`}
      className="w-full max-h-80"
    >
      <title>Separate boards and butt joint in the first cabinet frame</title>
      {b.map((box, i) => (
        <rect
          key={i}
          x={box.x0}
          y={box.y0}
          width={box.x1 - box.x0}
          height={box.y1 - box.y0}
          fill={i % 2 ? '#d9b17e' : '#80b7df'}
          stroke="#333"
          strokeWidth="2"
        >
          <title>{preview.parts[i].label}</title>
        </rect>
      ))}
    </svg>
  )
}
