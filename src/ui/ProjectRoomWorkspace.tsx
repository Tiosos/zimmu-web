import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { navigateTree } from '../lib/a11y'
import { isReadable, type ProductionRelease, type ReleaseEntry } from '../scene/releases'
import type { ComponentId, Scene } from '../scene/types'
import type {
  ProjectArea,
  ProjectRoom,
  ProjectStructure,
  RoomGeometry,
  ServiceKind,
  ServicePoint,
} from '../scene/projectStructure'
import {
  DEFAULT_CLEARANCE_TOLERANCES,
  emptyRoomGeometry,
  roomComponentIds,
} from '../scene/projectStructure'
import { cornerWarnings } from '../scene/blindCorner'
import {
  clearanceIssues,
  cornerToleranceIssues,
  frontToleranceIssues,
  servicePointIssues,
  walkwayIssues,
} from '../scene/roomAssessment'
import { roomIssues, roomSceneIssues } from '../scene/roomGeometry'
import { PlanView } from './PlanView'
import { RoomGeometryPanel } from './RoomGeometryPanel'
import { RoomAssessmentPanel } from './RoomAssessmentPanel'

type SideTab = 'overview' | 'geometry' | 'assessment' | 'services'

const SERVICE_KINDS: readonly ServiceKind[] = ['electrical', 'water', 'drain', 'gas']

export interface ProjectRoomWorkspaceProps {
  project: ProjectStructure
  projectName: string
  scene: Scene
  releases: readonly ReleaseEntry[]
  activeItemId: string
  selectedComponentId: ComponentId | null
  canUndoProject: boolean
  canRedoProject: boolean
  onProjectChange: (project: ProjectStructure) => void
  onSelectItem: (id: string) => void
  onSelectComponent: (id: string) => void
  onDropComponent: (id: string, position: { x: number; y: number; z: number }) => void
  onTurnComponent: (id: string) => void
  onOpenProjectPanel: () => void
  onUndoProject: () => void
  onRedoProject: () => void
}

interface FlatRoom {
  area: ProjectArea
  room: ProjectRoom
}

function flattenRooms(project: ProjectStructure): FlatRoom[] {
  return project.areas.flatMap((area) => area.rooms.map((room) => ({ area, room })))
}

/**
 * S5 shell (DESIGN-SIGNOFF.md §8). Structure, room geometry, installation assessment, service
 * points and project statistics all read and write the same project hierarchy and scene. The plan
 * uses the real PlanView and the right-hand panels reuse the existing room engines, so decisions
 * made here survive into drawings, installation output and saved files.
 */
export function ProjectRoomWorkspace({
  project,
  projectName,
  scene,
  releases,
  activeItemId,
  selectedComponentId,
  canUndoProject,
  canRedoProject,
  onProjectChange,
  onSelectItem,
  onSelectComponent,
  onDropComponent,
  onTurnComponent,
  onOpenProjectPanel,
  onUndoProject,
  onRedoProject,
}: ProjectRoomWorkspaceProps) {
  const [sideTab, setSideTab] = useState<SideTab>('overview')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [treeFocusId, setTreeFocusId] = useState<string | null>(null)
  const treeRef = useRef<HTMLElement>(null)
  const [serviceDraft, setServiceDraft] = useState({
    kind: 'electrical' as ServiceKind,
    name: '',
    size: '',
    x: '0',
    y: '0',
    elevation: '0',
    source: '',
  })

  const rooms = useMemo(() => flattenRooms(project), [project])
  const selected =
    rooms.find((entry) => entry.room.id === selectedRoomId) ??
    rooms.find((entry) => entry.room.items.some((item) => item.id === activeItemId)) ??
    rooms[0]
  const selectedRoom = selected?.room
  const geometry = selectedRoom?.geometry
  // The hierarchy is one tab stop: rows are treeitems, their inline editors are only reachable
  // with Enter. Arrow keys come from the shared navigateTree helper used by the scene tree.
  const treeRows = project.areas.flatMap((area) => [
    area.id,
    ...area.rooms.flatMap((room) => [room.id, ...room.items.map((item) => item.id)]),
  ])
  const tabStopId = treeRows.includes(treeFocusId ?? '') ? treeFocusId! : treeRows[0]
  const roving = (id: string, level: number) => ({
    role: 'treeitem' as const,
    'aria-level': level,
    tabIndex: tabStopId === id ? 0 : -1,
    onFocus: () => setTreeFocusId(id),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (navigateTree(e)) return
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        e.currentTarget.querySelector<HTMLElement>('input, button, select')?.focus()
      }
    },
  })
  useEffect(() => {
    treeRef.current
      ?.querySelectorAll<HTMLElement>('[role="treeitem"] input, [role="treeitem"] button')
      .forEach((el) => {
        el.tabIndex = -1
      })
  }, [project.areas])
  const services = useMemo(() => project.services ?? [], [project.services])
  const roomServices = services.filter((service) => service.roomId === selectedRoom?.id)
  const cabinetIds = useMemo(
    () =>
      selectedRoom === undefined
        ? new Set<string>()
        : roomComponentIds(
            selectedRoom.items.flatMap((item) => item.rootComponentIds),
            scene,
          ),
    [selectedRoom, scene],
  )
  const warnings = useMemo(
    () => cornerWarnings(scene.components, scene.materials),
    [scene.components, scene.materials],
  )
  const tolerances = geometry?.tolerances ?? DEFAULT_CLEARANCE_TOLERANCES

  const issues = useMemo(() => {
    if (geometry === undefined || selectedRoom === undefined) return []
    return [
      ...roomIssues(geometry).map((message) => `Geometry: ${message}`),
      ...roomSceneIssues(geometry, scene, cabinetIds).map((message) => `Placement: ${message}`),
      ...clearanceIssues(geometry, scene, cabinetIds).map((message) => `Clearance: ${message}`),
      ...walkwayIssues(geometry, scene, cabinetIds, tolerances),
      ...frontToleranceIssues(geometry, scene, cabinetIds, tolerances),
      ...cornerToleranceIssues(
        warnings.filter((warning) => cabinetIds.has(warning.cabinetId)),
        tolerances.corner,
      ),
      ...servicePointIssues(geometry, selectedRoom.id, services),
    ]
  }, [geometry, selectedRoom, scene, cabinetIds, warnings, tolerances, services])

  const itemCount = rooms.reduce((sum, entry) => sum + entry.room.items.length, 0)
  const cabinetCount = scene.components.filter((component) => component.kind === 'carcase').length
  const revisions = releases.filter(isReadable)
  const latestRevision = revisions.reduce(
    (best, entry) => (!best || entry.revision > best.revision ? entry : best),
    undefined as ProductionRelease | undefined,
  )

  const updateProject = (next: ProjectStructure) => onProjectChange(next)
  const updateRoom = (roomId: string, update: (room: ProjectRoom) => ProjectRoom) =>
    updateProject({
      ...project,
      areas: project.areas.map((area) => ({
        ...area,
        rooms: area.rooms.map((room) => (room.id === roomId ? update(room) : room)),
      })),
    })
  const updateGeometry = (roomId: string, next: RoomGeometry) =>
    updateRoom(roomId, (room) => ({ ...room, geometry: next }))

  const addArea = () =>
    updateProject({
      ...project,
      areas: [
        ...project.areas,
        {
          id: `area_${crypto.randomUUID()}`,
          name: `Area ${project.areas.length + 1}`,
          rooms: [
            {
              id: `room_${crypto.randomUUID()}`,
              name: 'Room 1',
              items: [
                {
                  id: `item_${crypto.randomUUID()}`,
                  name: 'Joinery 1',
                  rootComponentIds: [],
                  rootPartIds: [],
                },
              ],
            },
          ],
        },
      ],
    })
  const addRoom = (areaId: string) =>
    updateProject({
      ...project,
      areas: project.areas.map((area) =>
        area.id === areaId
          ? {
              ...area,
              rooms: [
                ...area.rooms,
                {
                  id: `room_${crypto.randomUUID()}`,
                  name: `Room ${area.rooms.length + 1}`,
                  items: [
                    {
                      id: `item_${crypto.randomUUID()}`,
                      name: 'Joinery 1',
                      rootComponentIds: [],
                      rootPartIds: [],
                    },
                  ],
                },
              ],
            }
          : area,
      ),
    })
  const addItem = (roomId: string) =>
    updateRoom(roomId, (room) => ({
      ...room,
      items: [
        ...room.items,
        {
          id: `item_${crypto.randomUUID()}`,
          name: `Joinery ${room.items.length + 1}`,
          rootComponentIds: [],
          rootPartIds: [],
        },
      ],
    }))

  const canAddService = Boolean(
    selectedRoom !== undefined &&
      serviceDraft.name.trim() &&
      serviceDraft.size.trim() &&
      serviceDraft.source.trim() &&
      Number.isFinite(Number(serviceDraft.x)) &&
      Number.isFinite(Number(serviceDraft.y)) &&
      Number.isFinite(Number(serviceDraft.elevation)),
  )
  const addService = () => {
    if (!canAddService || selectedRoom === undefined) return
    const service: ServicePoint = {
      id: `service_${crypto.randomUUID()}`,
      roomId: selectedRoom.id,
      kind: serviceDraft.kind,
      name: serviceDraft.name.trim(),
      size: serviceDraft.size.trim(),
      offset: { x: Number(serviceDraft.x), y: Number(serviceDraft.y) },
      elevation: Number(serviceDraft.elevation),
      source: serviceDraft.source.trim(),
    }
    updateProject({ ...project, services: [...services, service] })
    setServiceDraft({
      kind: 'electrical',
      name: '',
      size: '',
      x: '0',
      y: '0',
      elevation: '0',
      source: '',
    })
  }
  const updateService = (id: string, patch: Partial<ServicePoint>) =>
    updateProject({
      ...project,
      services: services.map((service) =>
        service.id === id ? { ...service, ...patch } : service,
      ),
    })
  const removeService = (id: string) =>
    updateProject({ ...project, services: services.filter((service) => service.id !== id) })

  return (
    <section className="zim-pr" aria-label="Project and room workspace">
      <header className="zim-pr-head">
        <div>
          <span className="zim-pr-eyebrow">PERSPECTIVE 05 / SITE</span>
          <h1>Project &amp; Room</h1>
          <p>
            Structure, room geometry, installation assessment and services in one place. Every
            edit uses the saved project hierarchy and the live scene.
          </p>
        </div>
        <div className="zim-pr-headstats" aria-label="Project headline counts">
          <span><b>{project.areas.length}</b> areas</span>
          <span><b>{rooms.length}</b> rooms</span>
          <span><b>{cabinetCount}</b> cabinets</span>
          <span><b>{scene.parts.length}</b> parts</span>
          <span><b>{scene.joints.length}</b> joints</span>
          <span><b>{latestRevision?.revision ?? 0}</b> revision</span>
        </div>
      </header>

      <div className="zim-pr-body">
        <nav className="zim-pr-tree" aria-label="Project structure tree" ref={treeRef}>
          <div className="zim-pr-tree-head">
            <b>Project structure</b>
            <button type="button" className="zim-pr-link" onClick={onUndoProject} disabled={!canUndoProject}>
              Undo
            </button>
            <button type="button" className="zim-pr-link" onClick={onRedoProject} disabled={!canRedoProject}>
              Redo
            </button>
          </div>
          <div role="tree" aria-label="Project rooms">
          {project.areas.map((area) => (
            <div className="zim-pr-area" key={area.id} {...roving(area.id, 1)}>
              <div className="zim-pr-row">
                <span className="zim-pr-kind">AREA</span>
                <input
                  aria-label={`Area name ${area.name}`}
                  value={area.name}
                  onChange={(event) =>
                    updateProject({
                      ...project,
                      areas: project.areas.map((candidate) =>
                        candidate.id === area.id
                          ? { ...candidate, name: event.target.value }
                          : candidate,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="zim-pr-link"
                  aria-label={`Add room to ${area.name}`}
                  onClick={() => addRoom(area.id)}
                >
                  + Room
                </button>
              </div>
              <div role="group">
              {area.rooms.map((room) => (
                <div className="zim-pr-room" key={room.id} {...roving(room.id, 2)}>
                  <div className="zim-pr-row">
                    <span className="zim-pr-kind">ROOM</span>
                    <input
                      aria-label={`Room name ${room.name}`}
                      value={room.name}
                      onChange={(event) =>
                        updateRoom(room.id, (candidate) => ({
                          ...candidate,
                          name: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={selectedRoom?.id === room.id ? 'on' : ''}
                      aria-label={`Select room ${room.name}`}
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      Select
                    </button>
                  </div>
                  <div role="group">
                  {room.items.map((item) => (
                    <div className="zim-pr-item" key={item.id} {...roving(item.id, 3)}>
                      <span className="zim-pr-kind">ITEM</span>
                      <input
                        aria-label={`Item name ${item.name}`}
                        value={item.name}
                        onChange={(event) =>
                          updateRoom(room.id, (candidate) => ({
                            ...candidate,
                            items: candidate.items.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, name: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className={activeItemId === item.id ? 'on' : ''}
                        aria-label={`${activeItemId === item.id ? 'Active' : 'Open'} — work in ${item.name}`}
                        onClick={() => {
                          setSelectedRoomId(room.id)
                          onSelectItem(item.id)
                        }}
                      >
                        {activeItemId === item.id ? 'Active' : 'Open'}
                      </button>
                      <span className="zim-pr-mini">
                        {item.rootComponentIds.length}c / {item.rootPartIds.length}p
                      </span>
                    </div>
                  ))}
                  </div>
                  <button
                    type="button"
                    className="zim-pr-add"
                    aria-label={`Add joinery item to ${room.name}`}
                    onClick={() => addItem(room.id)}
                  >
                    + Joinery item
                  </button>
                </div>
              ))}
              </div>
            </div>
          ))}
          </div>
          <button type="button" className="zim-pr-add" aria-label="Add project area" onClick={addArea}>
            + Area
          </button>
          <button type="button" className="zim-pr-open" onClick={onOpenProjectPanel}>
            Open detailed project editor
          </button>
        </nav>

        <div className="zim-pr-stage">
          <div className="zim-pr-stage-head">
            <div>
              <b>{selectedRoom?.name ?? 'No room selected'}</b>
              <span>{selected?.area.name ?? '—'}</span>
            </div>
            <span className={`zim-pr-badge ${issues.length === 0 ? 'green' : 'amber'}`}>
              {issues.length === 0 ? 'Passed' : `${issues.length} advisories`}
            </span>
          </div>
          <div className="zim-pr-plan" aria-label="Project room plan">
            <PlanView
              scene={scene}
              selectedId={selectedComponentId}
              onSelect={onSelectComponent}
              onDrop={onDropComponent}
              onTurn={onTurnComponent}
              warnings={warnings}
              room={geometry}
              cabinetIds={cabinetIds}
            />
          </div>
          <p className="zim-pr-footnote">
            Drag a cabinet to adjust its position; the same edit is available in the Workbench plan
            and lands in undo/redo.
          </p>
        </div>

        <aside className="zim-pr-side" aria-label="Project and room details">
          <div className="zim-pr-tabs" role="tablist" aria-label="Project detail tabs">
            {(
              [
                ['overview', 'Overview'],
                ['geometry', 'Geometry'],
                ['assessment', 'Assessment'],
                ['services', 'Services'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sideTab === id}
                className={sideTab === id ? 'on' : ''}
                onClick={() => setSideTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="zim-pr-side-body">
            {sideTab === 'overview' && (
              <>
                <div className="zim-pr-sec">Project metadata</div>
                <div className="zim-pr-props">
                  <div><span>Project</span><b>{projectName}</b></div>
                  <div><span>Project id</span><b className="zim-pr-mono">{project.id}</b></div>
                  <div><span>Areas / rooms</span><b>{project.areas.length} / {rooms.length}</b></div>
                  <div><span>Items</span><b>{itemCount}</b></div>
                  <div><span>Cabinets / parts</span><b>{cabinetCount} / {scene.parts.length}</b></div>
                  <div><span>Joints</span><b>{scene.joints.length}</b></div>
                  <div><span>Revisions</span><b>{revisions.length}</b></div>
                  <div>
                    <span>Latest verified revision</span>
                    <b>{latestRevision?.revision ?? 'None'}</b>
                  </div>
                </div>
                <div className="zim-pr-sec">Room summary</div>
                <div className="zim-pr-props">
                  <div><span>Room</span><b>{selectedRoom?.name ?? '—'}</b></div>
                  <div><span>Room cabinets</span><b>{cabinetIds.size}</b></div>
                  <div><span>Walls / openings</span><b>{geometry?.walls.length ?? 0} / {geometry?.openings.length ?? 0}</b></div>
                  <div><span>Service points</span><b>{roomServices.length}</b></div>
                  <div><span>Assessment</span><b>{issues.length === 0 ? 'Passed' : 'Advisory'}</b></div>
                </div>
              </>
            )}

            {sideTab === 'geometry' && (
              selectedRoom === undefined ? (
                <p className="zim-pr-empty">Add a room to edit its geometry.</p>
              ) : (
                <>
                  <RoomGeometryPanel
                    geometry={geometry}
                    cabinets={scene.components
                      .filter((component) => component.kind === 'carcase')
                      .map((component) => ({ id: component.id, label: component.label }))}
                    scene={scene}
                    onChange={(next) => updateGeometry(selectedRoom.id, next)}
                  />
                  {geometry === undefined && (
                    <button
                      type="button"
                      className="zim-pr-cta"
                      onClick={() => updateGeometry(selectedRoom.id, emptyRoomGeometry())}
                    >
                      Create room geometry
                    </button>
                  )}
                </>
              )
            )}

            {sideTab === 'assessment' && (
              selectedRoom === undefined || geometry === undefined ? (
                <p className="zim-pr-empty">Create room geometry to run installation checks.</p>
              ) : (
                <>
                  <div className="zim-pr-sec">Clearance tolerances (mm)</div>
                  <div className="zim-pr-tolerances">
                    {(['walkway', 'front', 'corner'] as const).map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          type="number"
                          min="0"
                          aria-label={`${key} tolerance`}
                          value={tolerances[key]}
                          onChange={(event) =>
                            updateGeometry(selectedRoom.id, {
                              ...geometry,
                              tolerances: {
                                ...tolerances,
                                [key]: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div aria-label="Room assessment findings">
                    <div className="zim-pr-sec">Findings</div>
                    {issues.length === 0 ? (
                      <p className="zim-pr-empty">No advisories reported by the completed checks.</p>
                    ) : (
                      <ul className="zim-pr-issues">
                        {issues.slice(0, 60).map((issue, index) => (
                          <li key={`${index}-${issue}`}>{issue}</li>
                        ))}
                      </ul>
                    )}
                    {issues.length > 60 && <p className="zim-pr-footnote">Showing the first 60 findings.</p>}
                  </div>
                  <RoomAssessmentPanel
                    room={geometry}
                    roomName={selectedRoom.name}
                    projectName={projectName}
                    scene={scene}
                    cabinetIds={cabinetIds}
                    onChange={(next) => updateGeometry(selectedRoom.id, next)}
                  />
                </>
              )
            )}

            {sideTab === 'services' && (
              selectedRoom === undefined ? (
                <p className="zim-pr-empty">Select a room to maintain service points.</p>
              ) : (
                <>
                  <div className="zim-pr-sec">Service points · {roomServices.length}</div>
                  {roomServices.map((service) => (
                    <div className="zim-pr-service" key={service.id}>
                      <select
                        aria-label={`Service kind ${service.name}`}
                        value={service.kind}
                        onChange={(event) =>
                          updateService(service.id, { kind: event.target.value as ServiceKind })
                        }
                      >
                        {SERVICE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>{kind}</option>
                        ))}
                      </select>
                      <input
                        aria-label={`Service name ${service.name}`}
                        value={service.name}
                        onChange={(event) => updateService(service.id, { name: event.target.value })}
                      />
                      <input
                        aria-label={`Service size ${service.name}`}
                        value={service.size}
                        onChange={(event) => updateService(service.id, { size: event.target.value })}
                      />
                      <input
                        type="number"
                        aria-label={`Service offset X ${service.name}`}
                        value={service.offset.x}
                        onChange={(event) =>
                          updateService(service.id, {
                            offset: { ...service.offset, x: Number(event.target.value) },
                          })
                        }
                      />
                      <input
                        type="number"
                        aria-label={`Service offset Y ${service.name}`}
                        value={service.offset.y}
                        onChange={(event) =>
                          updateService(service.id, {
                            offset: { ...service.offset, y: Number(event.target.value) },
                          })
                        }
                      />
                      <input
                        type="number"
                        aria-label={`Service elevation ${service.name}`}
                        value={service.elevation}
                        onChange={(event) =>
                          updateService(service.id, { elevation: Number(event.target.value) })
                        }
                      />
                      <input
                        aria-label={`Service source ${service.name}`}
                        value={service.source}
                        onChange={(event) => updateService(service.id, { source: event.target.value })}
                      />
                      <button
                        type="button"
                        className="zim-pr-link"
                        aria-label={`Remove service point ${service.name}`}
                        onClick={() => removeService(service.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="zim-pr-sec">Add service point</div>
                  <div className="zim-pr-service-form">
                    <select
                      aria-label="New service kind"
                      value={serviceDraft.kind}
                      onChange={(event) =>
                        setServiceDraft({ ...serviceDraft, kind: event.target.value as ServiceKind })
                      }
                    >
                      {SERVICE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>{kind}</option>
                      ))}
                    </select>
                    <input aria-label="New service name" placeholder="Name" value={serviceDraft.name} onChange={(e) => setServiceDraft({ ...serviceDraft, name: e.target.value })} />
                    <input aria-label="New service size" placeholder="Size" value={serviceDraft.size} onChange={(e) => setServiceDraft({ ...serviceDraft, size: e.target.value })} />
                    <input aria-label="New service offset X" type="number" value={serviceDraft.x} onChange={(e) => setServiceDraft({ ...serviceDraft, x: e.target.value })} />
                    <input aria-label="New service offset Y" type="number" value={serviceDraft.y} onChange={(e) => setServiceDraft({ ...serviceDraft, y: e.target.value })} />
                    <input aria-label="New service elevation" type="number" value={serviceDraft.elevation} onChange={(e) => setServiceDraft({ ...serviceDraft, elevation: e.target.value })} />
                    <input aria-label="New service source" placeholder="Source" value={serviceDraft.source} onChange={(e) => setServiceDraft({ ...serviceDraft, source: e.target.value })} />
                    <button type="button" className="zim-pr-cta" disabled={!canAddService} onClick={addService}>
                      Add service point
                    </button>
                  </div>
                  <p className="zim-pr-footnote">
                    Sizes, offsets and elevations are recorded in millimetres with their source.
                    Out-of-room and obstructed points are reported in Assessment.
                  </p>
                </>
              )
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
