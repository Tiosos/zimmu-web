import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Scene } from '../scene/types'
import type { ProjectStructure } from '../scene/projectStructure'
import { roomComponentIds } from '../scene/projectStructure'
import { defaultOpeningMotion, type OpeningMotion } from '../scene/openingMotionRecipe'
import {
  openingTargets,
  openingMatrices,
  openingSignature,
  defaultOpeningSetting,
  openingSettingIssue,
  previewOpeningSettings,
  checkOpeningPaths,
  type OpeningPreview,
  type MotionFinding,
} from '../scene/openingMotion'
import { OpeningMotionViews } from './OpeningMotionViews'
export interface OpeningTransient {
  signature: string
  matrices: Map<string, Float64Array>
  highlightedIds: string[]
}
const number = (value: string) => (value.trim() ? Number(value) : NaN)
export function OpeningMotionWorkspace({
  scene,
  project,
  onApply,
  onTransient,
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  scene: Scene
  project: ProjectStructure
  onApply: (p: OpeningPreview) => boolean
  onTransient: (p: OpeningTransient | null) => void
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const signature = openingSignature(scene, project)
  const [base, setBase] = useState(signature),
    [settings, setSettings] = useState<OpeningMotion>(() =>
      structuredClone(scene.openingMotion ?? defaultOpeningMotion()),
    ),
    [roomId, setRoomId] = useState(''),
    [cabinetId, setCabinetId] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [fractions, setFractions] = useState<Record<string, number>>({}),
    [limit, setLimit] = useState('90'),
    [offset, setOffset] = useState('0'),
    [playing, setPlaying] = useState(false),
    [direction, setDirection] = useState<1 | -1>(1),
    [message, setMessage] = useState(''),
    [findings, setFindings] = useState<MotionFinding[]>([]),
    [checkSummary, setCheckSummary] = useState(''),
    [highlight, setHighlight] = useState<string[]>([])
  const stale = base !== signature,
    targets = useMemo(() => openingTargets(scene), [scene]),
    rooms = project.areas.flatMap((a) => a.rooms),
    room = rooms.find((r) => r.id === roomId)
  const roomIds = room
    ? roomComponentIds(
        room.items.flatMap((i) => i.rootComponentIds),
        scene,
      )
    : null
  const visible = targets.filter(
    (t) => (!roomIds || roomIds.has(t.cabinetId)) && (!cabinetId || t.cabinetId === cabinetId),
  )
  const chosen = targets.filter((t) => selected.includes(t.id))
  const preview = useMemo(
    () => previewOpeningSettings(scene, project, settings),
    [scene, project, settings],
  )
  const motion = useMemo(() => {
    if (stale) return { matrices: new Map<string, Float64Array>(), error: '' }
    try {
      return {
        matrices: openingMatrices(
          scene,
          settings,
          Object.fromEntries(selected.map((id) => [id, fractions[id] ?? 0])),
        ),
        error: '',
      }
    } catch (e) {
      return {
        matrices: new Map<string, Float64Array>(),
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }, [scene, settings, selected, fractions, stale])
  useEffect(() => {
    onTransient({
      signature: base,
      matrices: motion.matrices,
      highlightedIds: stale ? [] : highlight,
    })
  }, [base, motion.matrices, highlight, stale, onTransient])
  useEffect(() => () => onTransient(null), [onTransient])
  useEffect(() => {
    if (!playing || stale || !selected.length) return
    const timer = setInterval(() => {
      const next = Object.fromEntries(
        selected.map((id) => [
          id,
          Math.max(0, Math.min(1, (fractions[id] ?? 0) + direction * 0.025)),
        ]),
      )
      setFractions(next)
      if (selected.every((id) => (direction === 1 ? next[id] >= 1 : next[id] <= 0)))
        setPlaying(false)
    }, 50)
    return () => clearInterval(timer)
  }, [playing, stale, selected, direction, fractions])
  const clearCheck = () => {
    setFindings([])
    setCheckSummary('')
    setHighlight([])
  }
  const reset = () => {
    setSettings(structuredClone(scene.openingMotion ?? defaultOpeningMotion()))
    setBase(signature)
    setSelected([])
    setFractions({})
    setPlaying(false)
    setMessage('')
    clearCheck()
  }
  const choose = (id: string) => {
    setPlaying(false)
    setSelected((prior) => (prior.includes(id) ? prior.filter((x) => x !== id) : [...prior, id]))
    clearCheck()
  }
  const stage = () => {
    if (!selected.length) {
      setMessage('Select fronts first.')
      return
    }
    const entries = selected.map((id) => {
      const t = targets.find((t) => t.id === id)!
      return {
        ...defaultOpeningSetting(t),
        limit: number(limit),
        axisOffset: t.kind === 'door' ? number(offset) : 0,
      }
    })
    const next = {
      ...settings,
      entries: [...settings.entries.filter((e) => !selected.includes(e.frontId)), ...entries],
    }
    const p = previewOpeningSettings(scene, project, next)
    if (p.errors.length) {
      setMessage(p.errors.join(' '))
      return
    }
    setSettings(next)
    setPlaying(false)
    setFractions({})
    setMessage('Opening settings staged.')
    clearCheck()
  }
  const setFraction = (fraction: number) => {
    setPlaying(false)
    setFractions(Object.fromEntries(selected.map((id) => [id, fraction])))
  }
  const load = (id: string) => {
    const t = targets.find((t) => t.id === id)!
    const e = settings.entries.find((e) => e.frontId === id) ?? defaultOpeningSetting(t)
    setSelected([id])
    setLimit(String(e.limit))
    setOffset(String(e.axisOffset))
    setPlaying(false)
    clearCheck()
  }
  const check = () => {
    setPlaying(false)
    const p = checkOpeningPaths(scene, project, settings, selected)
    setFindings(p.findings)
    setCheckSummary(
      p.errors.length
        ? p.errors.join(' ')
        : `${p.findings.length} potential conflicts across ${p.steps} intervals.${p.truncated ? ' Findings capped at 200; assessment incomplete.' : ''}`,
    )
    setHighlight([
      ...new Set(
        p.findings
          .flatMap((f) => [f.frontId, f.otherId])
          .filter((id) => scene.parts.some((p) => p.id === id)),
      ),
    ])
  }
  return (
    <aside
      aria-label="Door and drawer motion workspace"
      className="absolute right-3 top-14 z-40 w-[430px] max-w-[95vw] max-h-[85vh] overflow-y-auto bg-card text-foreground border rounded p-4 shadow-xl space-y-3"
    >
      <div className="flex justify-between gap-2">
        <h2 className="font-semibold">Door & Drawer Motion</h2>
        <Button size="sm" onClick={onClose}>
          Close motion
        </Button>
      </div>
      <p className="text-xs">
        Generic hinges and straight drawers. Open poses are temporary; manufacturing exports stay
        closed. Viewport editing and shortcuts are paused while this workspace is open.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={!canUndo} onClick={onUndo}>
          Undo motion change
        </Button>
        <Button size="sm" disabled={!canRedo} onClick={onRedo}>
          Redo motion change
        </Button>
        <Button size="sm" onClick={reset}>
          Reset motion draft
        </Button>
      </div>
      {stale && (
        <p role="alert">Scene or project changed. Reset the motion draft before continuing.</p>
      )}
      <fieldset disabled={stale} className="space-y-3">
        <label className="block">
          Room
          <select
            aria-label="Motion room"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value)
              setCabinetId('')
              setSelected([])
              setFractions({})
              setPlaying(false)
              clearCheck()
            }}
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Cabinet
          <select
            aria-label="Motion cabinet"
            value={cabinetId}
            onChange={(e) => {
              setCabinetId(e.target.value)
              setSelected([])
              setFractions({})
              setPlaying(false)
              clearCheck()
            }}
          >
            <option value="">All cabinets</option>
            {scene.components
              .filter((c) => c.kind === 'carcase' && (!roomIds || roomIds.has(c.id)))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setSelected(visible.filter((t) => !t.issue).map((t) => t.id))
              setFractions({})
              setPlaying(false)
              clearCheck()
            }}
          >
            Select supported fronts
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelected([])
              setFractions({})
              setPlaying(false)
              clearCheck()
            }}
          >
            Clear moving fronts
          </Button>
        </div>
        {!visible.length && (
          <p>
            No generated door or drawer fronts in this selection. Add fronts in the cabinet editor;
            false fronts and cover panels do not move.
          </p>
        )}
        <ul className="space-y-2">
          {visible.map((t) => {
            const e = settings.entries.find((e) => e.frontId === t.id) ?? defaultOpeningSetting(t),
              issue = openingSettingIssue(t, e)
            return (
              <li key={t.id} className="border rounded p-2 text-xs">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Move ${t.label}`}
                    checked={selected.includes(t.id)}
                    disabled={!!t.issue}
                    onChange={() => choose(t.id)}
                  />
                  {t.label} ({t.kind === 'door' ? `${t.hinge} hinge` : 'drawer'})
                </label>
                {issue && <p>{issue}</p>}
                <div>
                  {t.kind === 'door'
                    ? `Maximum ${e.limit}°; offset ${e.axisOffset} mm`
                    : `Travel ${e.limit.toFixed(1)} mm; runner/box nominal ${t.nominal?.toFixed(1) ?? 'unavailable'} mm (generic, not rated travel)`}
                </div>
                <div>
                  Current {(e.limit * (fractions[t.id] ?? 0)).toFixed(1)}
                  {t.kind === 'door' ? '°' : ' mm'}
                </div>
                <Button size="sm" disabled={!!t.issue} onClick={() => load(t.id)}>
                  Load motion {t.label}
                </Button>
                {selected.includes(t.id) && (
                  <input
                    aria-label={`Opening fraction ${t.label}`}
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={fractions[t.id] ?? 0}
                    onChange={(event) => {
                      setPlaying(false)
                      setFractions((prior) => ({ ...prior, [t.id]: Number(event.target.value) }))
                    }}
                  />
                )}
              </li>
            )
          })}
        </ul>
        <label className="block">
          Maximum angle (°) / travel (mm)
          <input
            aria-label="Maximum opening"
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <label className="block">
          Hinge axis offset (mm)
          <input
            aria-label="Hinge axis offset"
            type="number"
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
          />
        </label>
        <Button size="sm" onClick={stage}>
          Stage selected opening settings
        </Button>
        <label className="block">
          Operating clearance (mm)
          <input
            aria-label="Operating clearance"
            type="number"
            value={Number.isFinite(settings.clearance) ? settings.clearance : ''}
            onChange={(e) => {
              setSettings({ ...settings, clearance: number(e.target.value) })
              clearCheck()
            }}
          />
        </label>
        <label className="block">
          Handle envelope projection (mm)
          <input
            aria-label="Handle envelope projection"
            type="number"
            value={Number.isFinite(settings.pullProjection) ? settings.pullProjection : ''}
            onChange={(e) => {
              setSettings({ ...settings, pullProjection: number(e.target.value) })
              clearCheck()
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!selected.length || !!motion.error}
            onClick={() => setFraction(1)}
          >
            Open selected
          </Button>
          <Button size="sm" onClick={() => setFraction(0)}>
            Close selected
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setFractions({})
              setPlaying(false)
            }}
          >
            Reset all closed
          </Button>
          <Button
            size="sm"
            disabled={!selected.length || !!motion.error}
            onClick={() => {
              setDirection(1)
              setPlaying(true)
            }}
          >
            Animate opening
          </Button>
          <Button
            size="sm"
            disabled={!selected.length || !!motion.error}
            onClick={() => {
              setDirection(-1)
              setPlaying(true)
            }}
          >
            Animate closing
          </Button>
          <Button
            size="sm"
            disabled={!selected.length || !!motion.error}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? 'Pause motion' : 'Resume motion'}
          </Button>
        </div>
        <label className="block">
          Selected opening progress
          <input
            aria-label="Selected opening progress"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={selected.length ? (fractions[selected[0]] ?? 0) : 0}
            onChange={(e) => setFraction(Number(e.target.value))}
          />
        </label>
        <Button
          size="sm"
          disabled={!selected.length || !!motion.error || !!preview.errors.length}
          onClick={check}
        >
          Check opening paths
        </Button>
        {checkSummary && <p role="status">{checkSummary}</p>}
        <ul>
          {findings.map((f) => (
            <li key={`${f.frontId}|${f.otherId}`} className="text-xs">
              <button
                className="underline text-left"
                onClick={() => {
                  setSelected((prior) =>
                    prior.includes(f.frontId) ? prior : [...prior, f.frontId],
                  )
                  setFractions(Object.fromEntries(selected.map((id) => [id, f.at])))
                  setHighlight([f.frontId, f.otherId])
                  setPlaying(false)
                }}
              >
                {f.message}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs">
          Checks use conservative swept world boxes, 2°/10 mm intervals with rotation error
          inflation, and the full entered handle envelope. Boxes do not subtract machining, wall
          openings or intentional hinge contacts. Walls have unbounded height. Findings are
          advisory; independent motion timing and supplier mechanisms are not assessed.
        </p>
        {!!chosen.length && !motion.error && (
          <OpeningMotionViews
            scene={scene}
            targets={chosen}
            settings={settings}
            fractions={fractions}
            matrices={motion.matrices}
          />
        )}
        {settings.entries.some((e) => !targets.some((t) => t.id === e.frontId)) && (
          <p>Some saved fronts are missing. Their settings remain stored until removed.</p>
        )}
        <ul>
          {settings.entries.map((e) => (
            <li key={e.frontId} className="text-xs">
              Saved setting: {targets.find((t) => t.id === e.frontId)?.label ?? e.frontId}{' '}
              <button
                className="underline"
                onClick={() => {
                  setSettings({
                    ...settings,
                    entries: settings.entries.filter((q) => q.frontId !== e.frontId),
                  })
                  clearCheck()
                }}
              >
                Remove setting {e.frontId}
              </button>
            </li>
          ))}
        </ul>
        {!!preview.errors.length && <p role="alert">{preview.errors.join(' ')}</p>}
        {motion.error && <p role="alert">{motion.error}</p>}
        <Button
          disabled={stale || !!preview.errors.length || !preview.changed}
          onClick={() => {
            setPlaying(false)
            if (onApply(preview)) {
              setFractions({})
              setMessage('Motion settings applied. Reset to continue.')
            } else setMessage('The source changed. Reset and preview again.')
          }}
        >
          Apply motion settings
        </Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      <Button size="sm" onClick={reset}>
        Cancel motion changes
      </Button>
    </aside>
  )
}
