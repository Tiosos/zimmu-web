import type { Scene } from '../scene/types'
import type { ProjectStructure } from '../scene/projectStructure'
import { emptyRoomGeometry, moveRootToItem } from '../scene/projectStructure'
import { RoomGeometryPanel } from './RoomGeometryPanel'
import { Button } from '@/components/ui/button'

interface Props {
  project: ProjectStructure
  scene: Scene
  onChange: (value: ProjectStructure) => void
  activeItemId: string
  onSelectItem: (id: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
}

export function ProjectPanel({ project, scene, onChange, activeItemId, onSelectItem,
  canUndo, canRedo, onUndo, onRedo, onClose }: Props) {
  const rename = (id: string, name: string) => onChange({ ...project, areas: project.areas.map((area) => ({
    ...area, name: area.id === id ? name : area.name,
    rooms: area.rooms.map((room) => ({ ...room, name: room.id === id ? name : room.name,
      items: room.items.map((item) => item.id === id ? { ...item, name } : item),
    })),
  })) })
  const addArea = () => onChange({ ...project, areas: [...project.areas, {
    id: `area_${crypto.randomUUID()}`, name: 'New Area', rooms: [{
      id: `room_${crypto.randomUUID()}`, name: 'New Room', items: [{
        id: `item_${crypto.randomUUID()}`, name: 'New Joinery Item', rootComponentIds: [], rootPartIds: [],
      }], geometry: emptyRoomGeometry(),
    }],
  }] })
  const addRoom = (areaId: string) => onChange({ ...project, areas: project.areas.map((area) =>
    area.id === areaId ? { ...area, rooms: [...area.rooms, {
      id: `room_${crypto.randomUUID()}`, name: 'New Room', items: [{
        id: `item_${crypto.randomUUID()}`, name: 'New Joinery Item', rootComponentIds: [], rootPartIds: [],
      }], geometry: emptyRoomGeometry(),
    }] } : area,
  ) })
  const addItem = (roomId: string) => onChange({ ...project, areas: project.areas.map((area) => ({
    ...area, rooms: area.rooms.map((room) => room.id === roomId ? { ...room, items: [...room.items, {
      id: `item_${crypto.randomUUID()}`, name: 'New Joinery Item', rootComponentIds: [], rootPartIds: [],
    }] } : room),
  })) })
  const items = project.areas.flatMap((a) => a.rooms.flatMap((r) => r.items))
  const roots = scene.components.filter((c) => c.parentId === null)
  const looseParts = scene.parts.filter((p) => p.parentId === null)
  const input = (id: string, name: string, label: string) => <input aria-label={`${label} name`}
    value={name} onChange={(e) => rename(id, e.target.value)}
    className="bg-background border border-border rounded px-2 py-1 text-xs" />

  return <div role="dialog" aria-label="Project structure" aria-modal="true"
    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="bg-card text-foreground border border-border rounded-lg p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4">
      <div className="flex justify-between items-center"><h2 className="text-lg font-semibold">Project structure</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={!canUndo} onClick={onUndo}>Undo</Button>
          <Button variant="outline" size="sm" disabled={!canRedo} onClick={onRedo}>Redo</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div></div>
      <p className="text-xs text-muted-foreground">Names are editable; IDs remain stable. Assign each top-level assembly to one item.</p>
      {project.areas.map((area) => <section key={area.id} className="border border-border rounded p-3 space-y-2">
        <div className="text-xs">Area {input(area.id, area.name, 'Area')}</div>
        {area.rooms.map((room) => <div key={room.id} className="ml-3 border-l border-border pl-3 space-y-2">
          <div className="text-xs">Room {input(room.id, room.name, 'Room')}</div>
          {room.items.map((item) => <div key={item.id} className="ml-3 text-xs flex gap-2 items-center">
            Item {input(item.id, item.name, 'Item')}
            <span className="text-muted-foreground">{item.rootComponentIds.length} assemblies, {item.rootPartIds.length} loose parts</span>
            <Button size="sm" variant={activeItemId === item.id ? 'secondary' : 'outline'}
              onClick={() => onSelectItem(item.id)}>{activeItemId === item.id ? 'Active' : 'Work in item'}</Button>
          </div>)}
          <Button size="sm" variant="outline" onClick={() => addItem(room.id)}>Add item</Button>
          <RoomGeometryPanel geometry={room.geometry}
            scene={scene}
            cabinets={scene.components.filter((c) => c.kind === 'carcase' && c.parentId === null &&
              room.items.some((item) => item.rootComponentIds.includes(c.id))).map((c) => ({ id: c.id, label: c.label }))}
            onChange={(geometry) => onChange({ ...project,
            areas: project.areas.map((a) => ({ ...a, rooms: a.rooms.map((r) => r.id === room.id ? { ...r, geometry } : r) })),
          })} />
        </div>)}
        <Button size="sm" variant="outline" onClick={() => addRoom(area.id)}>Add room</Button>
      </section>)}
      <Button size="sm" variant="outline" onClick={addArea}>Add area</Button>
      {roots.length > 0 && <section className="border-t border-border pt-3 space-y-2">
        <h3 className="text-sm font-medium">Assembly ownership</h3>
        {roots.map((root) => <label key={root.id} className="flex gap-2 items-center text-xs">
          <span className="w-32 truncate" title={root.label}>{root.label}</span>
          <select aria-label={`Item for ${root.label}`}
            value={items.find((item) => item.rootComponentIds.includes(root.id))?.id ?? ''}
            onChange={(e) => onChange(moveRootToItem(project, root.id, e.target.value))}
            className="bg-background border border-border rounded px-2 py-1 flex-1">
            {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>)}
      </section>}
      {looseParts.length > 0 && <section className="border-t border-border pt-3 space-y-2">
        <h3 className="text-sm font-medium">Loose parts</h3>
        {looseParts.map((part) => <label key={part.id} className="flex gap-2 items-center text-xs">
          <span className="w-32 truncate" title={part.label}>{part.label}</span>
          <select aria-label={`Item for ${part.label}`}
            value={items.find((item) => item.rootPartIds.includes(part.id))?.id ?? ''}
            onChange={(e) => onChange(moveRootToItem(project, part.id, e.target.value, 'part'))}
            className="bg-background border border-border rounded px-2 py-1 flex-1">
            {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>)}
      </section>}
    </div>
  </div>
}
