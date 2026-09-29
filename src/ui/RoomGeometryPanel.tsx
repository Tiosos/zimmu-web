import type { RoomGeometry } from '../scene/projectStructure'
import type { Scene } from '../scene/types'
import { emptyRoomGeometry } from '../scene/projectStructure'
import { roomSceneIssues, wallLength } from '../scene/roomGeometry'
import { Button } from '@/components/ui/button'

interface Props {
  geometry: RoomGeometry | undefined
  onChange: (value: RoomGeometry) => void
  cabinets: { id: string; label: string }[]
  scene: Scene
}

export function RoomGeometryPanel({ geometry: supplied, onChange, cabinets, scene }: Props) {
  const geometry = supplied ?? emptyRoomGeometry()
  const number = (label: string, value: number, update: (value: number) => void) =>
    <label className="inline-flex items-center gap-1 text-xs">{label}
      <input aria-label={label} type="number" value={value} onChange={(e) => update(Number(e.target.value))}
        className="w-20 bg-background border border-border rounded px-1 py-0.5" />
    </label>
  const updateWall = (id: string, update: (wall: RoomGeometry['walls'][number]) => RoomGeometry['walls'][number]) =>
    onChange({ ...geometry, walls: geometry.walls.map((wall) => wall.id === id ? update(wall) : wall) })
  const issues = roomSceneIssues(geometry, scene, new Set(cabinets.map((c) => c.id)))
  return <div className="ml-3 border border-border rounded p-2 space-y-2 text-xs">
    <div className="font-medium">Room geometry (mm)</div>
    <div className="flex flex-wrap gap-2">
      {number('Origin X', geometry.origin.x, (x) => onChange({ ...geometry, origin: { ...geometry.origin, x } }))}
      {number('Origin Y', geometry.origin.y, (y) => onChange({ ...geometry, origin: { ...geometry.origin, y } }))}
      {number('Room rotation °', geometry.rotation, (rotation) => onChange({ ...geometry, rotation }))}
    </div>
    {geometry.walls.map((wall) => <div key={wall.id} className="border-l border-border pl-2 space-y-1">
      <div className="flex flex-wrap gap-2 items-center">
        <input aria-label="Wall name" value={wall.name} onChange={(e) => updateWall(wall.id, (w) => ({ ...w, name: e.target.value }))}
          className="w-24 bg-background border border-border rounded px-1" />
        {number('Start X', wall.start.x, (x) => updateWall(wall.id, (w) => ({ ...w, start: { ...w.start, x } })))}
        {number('Start Y', wall.start.y, (y) => updateWall(wall.id, (w) => ({ ...w, start: { ...w.start, y } })))}
        {number('End X', wall.end.x, (x) => updateWall(wall.id, (w) => ({ ...w, end: { ...w.end, x } })))}
        {number('End Y', wall.end.y, (y) => updateWall(wall.id, (w) => ({ ...w, end: { ...w.end, y } })))}
        <span>Drawn: {Math.round(wallLength(wall))} mm</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant="outline" onClick={() => updateWall(wall.id, (w) => ({ ...w,
          measuredLength: w.measuredLength ? undefined : { value: wallLength(w), source: 'Site measure', recordedAt: new Date().toISOString(), uncertainty: 0 },
        }))}>{wall.measuredLength ? 'Remove measurement' : 'Record measurement'}</Button>
        {wall.measuredLength && <>
          {number('Measured mm', wall.measuredLength.value, (value) => updateWall(wall.id, (w) => ({ ...w, measuredLength: { ...w.measuredLength!, value } })))}
          {number('Uncertainty ±mm', wall.measuredLength.uncertainty, (uncertainty) => updateWall(wall.id, (w) => ({ ...w, measuredLength: { ...w.measuredLength!, uncertainty } })))}
          <input aria-label="Measurement source" value={wall.measuredLength.source}
            onChange={(e) => updateWall(wall.id, (w) => ({ ...w, measuredLength: { ...w.measuredLength!, source: e.target.value } }))}
            className="bg-background border border-border rounded px-1" />
        </>}
        <Button size="sm" variant="outline" onClick={() => onChange({ ...geometry,
          walls: geometry.walls.filter((w) => w.id !== wall.id),
          openings: geometry.openings.filter((o) => o.wallId !== wall.id),
          placements: geometry.placements.filter((p) => p.wallId !== wall.id),
        })}>Remove wall</Button>
      </div>
      {geometry.openings.filter((o) => o.wallId === wall.id).map((opening) => <div key={opening.id} className="flex flex-wrap gap-2 items-center">
        <span>{opening.kind}</span>
        {(['offset', 'width', 'sill', 'height'] as const).map((field) => number(field, opening[field], (value) => onChange({ ...geometry,
          openings: geometry.openings.map((o) => o.id === opening.id ? { ...o, [field]: value } : o),
        })))}
        <Button size="sm" variant="outline" onClick={() => onChange({ ...geometry, openings: geometry.openings.filter((o) => o.id !== opening.id) })}>Remove opening</Button>
      </div>)}
      <div className="flex gap-1">{(['door', 'window'] as const).map((kind) => <Button key={kind} size="sm" variant="outline" onClick={() => onChange({ ...geometry,
        openings: [...geometry.openings, { id: `opening_${crypto.randomUUID()}`, wallId: wall.id, kind, offset: 0, width: 900, sill: 0, height: 2100 }],
      })}>Add {kind}</Button>)}</div>
    </div>)}
    <Button size="sm" variant="outline" onClick={() => {
      const last = geometry.walls.at(-1)?.end ?? { x: 0, y: 0 }
      onChange({ ...geometry, walls: [...geometry.walls, { id: `wall_${crypto.randomUUID()}`,
        name: `Wall ${geometry.walls.length + 1}`, start: last, end: { x: last.x + 3000, y: last.y } }] })
    }}>Add wall</Button>
    <div className="font-medium">Obstacles</div>
    {geometry.obstacles.map((obstacle) => <div key={obstacle.id} className="flex flex-wrap gap-2 items-center">
      <input aria-label="Obstacle name" value={obstacle.name} onChange={(e) => onChange({ ...geometry,
        obstacles: geometry.obstacles.map((o) => o.id === obstacle.id ? { ...o, name: e.target.value } : o),
      })} className="w-24 bg-background border border-border rounded px-1" />
      {(['x', 'y'] as const).map((axis) => number(axis, obstacle.position[axis], (value) => onChange({ ...geometry,
        obstacles: geometry.obstacles.map((o) => o.id === obstacle.id ? { ...o, position: { ...o.position, [axis]: value } } : o),
      })))}
      {(['width', 'depth', 'height'] as const).map((field) => number(field, obstacle[field], (value) => onChange({ ...geometry,
        obstacles: geometry.obstacles.map((o) => o.id === obstacle.id ? { ...o, [field]: value } : o),
      })))}
      <Button size="sm" variant="outline" onClick={() => onChange({ ...geometry, obstacles: geometry.obstacles.filter((o) => o.id !== obstacle.id) })}>Remove</Button>
    </div>)}
    <Button size="sm" variant="outline" onClick={() => onChange({ ...geometry, obstacles: [...geometry.obstacles, {
      id: `obstacle_${crypto.randomUUID()}`, name: 'Obstacle', position: { x: 0, y: 0 }, width: 600, depth: 600, height: 900,
    }] })}>Add obstacle</Button>
    {cabinets.length > 0 && geometry.walls.length > 0 && <div className="space-y-1">
      <div className="font-medium">Wall placement (free placement remains available)</div>
      {cabinets.map((cabinet) => {
        const placement = geometry.placements.find((p) => p.cabinetId === cabinet.id)
        return <div key={cabinet.id} className="flex flex-wrap gap-2 items-center">
          <span>{cabinet.label}</span>
          <select aria-label={`Wall for ${cabinet.label}`} value={placement?.wallId ?? ''}
            onChange={(e) => onChange({ ...geometry, placements: [
              ...geometry.placements.filter((p) => p.cabinetId !== cabinet.id),
              ...(e.target.value ? [{ cabinetId: cabinet.id, wallId: e.target.value, offset: 0, setback: 0,
                manualOffset: { x: 0, y: 0 } }] : []),
            ] })} className="bg-background border border-border rounded px-1">
            <option value="">Free</option>
            {geometry.walls.map((wall) => <option key={wall.id} value={wall.id}>{wall.name}</option>)}
          </select>
          {placement && <>
            {(['offset', 'setback'] as const).map((field) => number(field, placement[field], (value) => onChange({ ...geometry,
              placements: geometry.placements.map((p) => p.cabinetId === cabinet.id ? { ...p, [field]: value } : p),
            })))}
            {(['x', 'y'] as const).map((axis) => number(`Manual ${axis}`, placement.manualOffset[axis], (value) => onChange({ ...geometry,
              placements: geometry.placements.map((p) => p.cabinetId === cabinet.id ? { ...p,
                manualOffset: { ...p.manualOffset, [axis]: value } } : p),
            })))}
          </>}
        </div>
      })}
    </div>}
    {issues.length > 0 && <ul className="list-disc pl-4 text-amber-600" aria-label="Room geometry warnings">
      {issues.map((issue, i) => <li key={i}>{issue}</li>)}
    </ul>}
  </div>
}
