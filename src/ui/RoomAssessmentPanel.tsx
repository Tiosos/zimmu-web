import { useState } from 'react'
import type { RoomGeometry } from '../scene/projectStructure'
import { operableFronts } from '../scene/projectStructure'
import type { CarcaseComponent, Scene } from '../scene/types'
import { clearanceIssues } from '../scene/roomAssessment'
import { wallLength } from '../scene/roomGeometry'
import { buildWallElevationSheet } from '../geom/drawing'
import { buildSvg } from './buildSvg'
import { buildDxf } from './buildDxf'
import { downloadBlob } from './download'
import { sheetFilename } from './sheetFilename'
import { Button } from '@/components/ui/button'

interface Props {
  room: RoomGeometry
  roomName: string
  projectName: string
  scene: Scene
  cabinetIds: ReadonlySet<string>
  onChange: (room: RoomGeometry) => void
}

export function RoomAssessmentPanel({ room, roomName, projectName, scene, cabinetIds, onChange }: Props) {
  const [draft, setDraft] = useState({ name: '', x: '0', y: '0', value: '', uncertainty: '', source: '' })
  const cabinets = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase' && cabinetIds.has(c.id))
  const warnings = clearanceIssues(room, scene, cabinetIds)
  const canRecord = Boolean(room.datum?.trim() && draft.name.trim() && draft.source.trim() &&
    draft.value !== '' && draft.uncertainty !== '' && Number.isFinite(Number(draft.value)) &&
    Number.isFinite(Number(draft.x)) && Number.isFinite(Number(draft.y)) &&
    Number.isFinite(Number(draft.uncertainty)) && Number(draft.uncertainty) >= 0)
  const field = (name: keyof typeof draft, label: string) => <input aria-label={label}
    type={name === 'name' || name === 'source' ? 'text' : 'number'} placeholder={label}
    value={draft[name]} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
    className="w-24 bg-background border border-border rounded px-1" />

  return <div className="ml-3 border border-border rounded p-2 space-y-3 text-xs">
    <h3 className="font-medium">Site levels and front clearances</h3>
    <div className="space-y-1">
      <label>Level datum <input aria-label="Level datum" placeholder="e.g. project ±0" value={room.datum ?? ''}
        disabled={Boolean(room.siteLevels?.length)}
        onChange={(e) => onChange({ ...room, datum: e.target.value })}
        className="bg-background border border-border rounded px-1" /></label>
      {Boolean(room.siteLevels?.length) && <p className="text-muted-foreground">Remove recorded levels before changing the datum.</p>}
      <div className="flex flex-wrap gap-2 items-center">
        {field('name', 'Level point name')}{field('x', 'Local X mm')}{field('y', 'Local Y mm')}
        {field('value', 'Elevation mm')}{field('uncertainty', 'Uncertainty ±mm')}{field('source', 'Level source')}
        <Button size="sm" variant="outline" disabled={!canRecord} onClick={() => {
          onChange({ ...room, siteLevels: [...(room.siteLevels ?? []), { id: `level_${crypto.randomUUID()}`,
            name: draft.name.trim(), at: { x: Number(draft.x), y: Number(draft.y) },
            elevation: { value: Number(draft.value), uncertainty: Number(draft.uncertainty),
              source: draft.source.trim(), recordedAt: new Date().toISOString() },
          }] })
          setDraft({ name: '', x: '0', y: '0', value: '', uncertainty: '', source: '' })
        }}>Record level</Button>
      </div>
      {room.siteLevels?.map((level) => <div key={level.id}>
        {level.name}: {level.elevation.value} ±{level.elevation.uncertainty} mm at ({level.at.x}, {level.at.y}) — {level.elevation.source}, {level.elevation.recordedAt}
        <Button size="sm" variant="outline" className="ml-2" onClick={() => onChange({ ...room,
          siteLevels: room.siteLevels?.filter((candidate) => candidate.id !== level.id),
        })}>Remove level</Button>
      </div>)}
      {!room.siteLevels?.length && <p className="text-amber-600">No verified site level recorded.</p>}
    </div>
    <div className="space-y-1">
      <h4 className="font-medium">Designer-stated front projection (mm)</h4>
      <p className="text-muted-foreground">Enter actual travel or the conservative swing envelope; no hardware reach is assumed.</p>
      {cabinets.flatMap((cabinet) => operableFronts(cabinet.params.section, cabinet.params.frame).map((front) => {
        const assumption = room.clearances?.find((c) => c.cabinetId === cabinet.id && c.sectionId === front.sectionId)
        return <label key={`${cabinet.id}:${front.sectionId}`} className="flex gap-2 items-center">
          {cabinet.label} {front.kind} ({front.sectionId})
          <input aria-label={`Projection for ${cabinet.label} ${front.sectionId}`} type="number" min="0"
            placeholder="Not assessed" value={assumption?.projection ?? ''}
            onChange={(e) => {
              const projection = Number(e.target.value)
              onChange({ ...room, clearances: [
                ...(room.clearances ?? []).filter((c) => c.cabinetId !== cabinet.id || c.sectionId !== front.sectionId),
                ...(e.target.value && Number.isFinite(projection) && projection > 0 ? [{ cabinetId: cabinet.id, sectionId: front.sectionId,
                  kind: front.kind, projection }] : []),
              ] })
            }} className="w-24 bg-background border border-border rounded px-1" />
        </label>
      }))}
      {warnings.length > 0 && <ul aria-label="Clearance warnings" className="list-disc pl-4 text-amber-600">
        {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
      </ul>}
    </div>
    <div className="space-y-2">
      <h4 className="font-medium">Wall elevations (mm)</h4>
      {room.walls.map((wall) => {
        const sheet = buildWallElevationSheet({ roomName, room, scene, cabinetIds }, wall,
          new Date().toISOString().slice(0, 10))
        return <div key={wall.id} className="overflow-x-auto border border-border rounded p-1">
          <div>{wall.name} — {Math.round(wallLength(wall))} mm drawn length</div>
          {sheet === null
            ? <p className="text-muted-foreground">Nothing placed on this wall and no site length recorded.</p>
            : <>
              <div role="img" aria-label={`Elevation of ${wall.name}`} className="min-w-[400px] bg-white"
                dangerouslySetInnerHTML={{ __html: buildSvg(sheet) }} />
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="outline" aria-label={`Export ${wall.name} elevation SVG`}
                  onClick={() => downloadBlob(buildSvg(sheet), sheetFilename(sheet, projectName, 'svg'), 'image/svg+xml')}>
                  Export SVG</Button>
                <Button size="sm" variant="outline" aria-label={`Export ${wall.name} elevation DXF`}
                  onClick={() => downloadBlob(buildDxf(sheet), sheetFilename(sheet, projectName, 'dxf'), 'application/dxf')}>
                  Export DXF</Button>
              </div>
            </>}
        </div>
      })}
    </div>
  </div>
}
