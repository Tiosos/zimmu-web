import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ProjectRoomWorkspace, type ProjectRoomWorkspaceProps } from './ProjectRoomWorkspace'
import {
  DEFAULT_CLEARANCE_TOLERANCES,
  defaultProject,
  emptyRoomGeometry,
  type ProjectStructure,
} from '../scene/projectStructure'
import type { Scene } from '../scene/types'

afterEach(() => cleanup())

const scene: Scene = {
  parts: [],
  materials: {},
  hardware: [],
  joints: [],
  components: [],
}

function fixture(): ProjectStructure {
  const project = defaultProject(scene, 's5')
  const room = project.areas[0].rooms[0]
  room.geometry = {
    ...emptyRoomGeometry(),
    walls: [
      { id: 'north', name: 'North', start: { x: 0, y: 0 }, end: { x: 3600, y: 0 } },
    ],
    obstacles: [
      {
        id: 'island',
        name: 'Island',
        position: { x: 1200, y: -600 },
        width: 400,
        depth: 400,
        height: 900,
      },
    ],
    tolerances: { ...DEFAULT_CLEARANCE_TOLERANCES },
  }
  project.services = [
    {
      id: 'service-existing',
      roomId: room.id,
      kind: 'electrical',
      name: 'Outlet A',
      size: '13A',
      offset: { x: 1800, y: 0 },
      elevation: 300,
      source: 'Site survey',
    },
  ]
  return project
}

function renderWorkspace(overrides: Partial<ProjectRoomWorkspaceProps> = {}) {
  const project = fixture()
  const callbacks = {
    onProjectChange: vi.fn(),
    onSelectItem: vi.fn(),
    onSelectComponent: vi.fn(),
    onDropComponent: vi.fn(),
    onTurnComponent: vi.fn(),
    onOpenProjectPanel: vi.fn(),
    onUndoProject: vi.fn(),
    onRedoProject: vi.fn(),
  }
  const props: ProjectRoomWorkspaceProps = {
    project,
    projectName: 'Kitchen job',
    scene,
    releases: [],
    activeItemId: project.areas[0].rooms[0].items[0].id,
    selectedComponentId: null,
    canUndoProject: true,
    canRedoProject: false,
    ...callbacks,
    ...overrides,
  }
  return { project, ...render(<ProjectRoomWorkspace {...props} />), callbacks }
}

describe('ProjectRoomWorkspace (S5 shell)', () => {
  it('shows project structure, statistics, room plan and detail tabs', () => {
    renderWorkspace()
    const workspace = screen.getByLabelText('Project and room workspace')
    expect(within(workspace).getByText('Project & Room')).toBeTruthy()
    expect(screen.getByLabelText('Project structure tree')).toBeTruthy()
    expect(screen.getByLabelText('Project room plan')).toBeTruthy()
    expect(screen.getByLabelText('Project headline counts').textContent).toContain('cabinets')
    for (const tab of ['Overview', 'Geometry', 'Assessment', 'Services']) {
      expect(screen.getByRole('tab', { name: tab })).toBeTruthy()
    }
  })

  it('reuses the real room geometry panel', () => {
    const { project } = renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: 'Geometry' }))
    expect(screen.getByText('Room geometry (mm)')).toBeTruthy()
    expect(screen.getByLabelText('Wall name')).toBeTruthy()
    expect(project.areas[0].rooms[0].geometry?.walls).toHaveLength(1)
  })

  it('exposes configurable tolerances and reports assessment findings', () => {
    const { callbacks } = renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: 'Assessment' }))
    for (const name of ['walkway tolerance', 'front tolerance', 'corner tolerance']) {
      expect(screen.getByLabelText(name)).toBeTruthy()
    }
    fireEvent.change(screen.getByLabelText('walkway tolerance'), { target: { value: '1200' } })
    const next = callbacks.onProjectChange.mock.calls[0][0] as ProjectStructure
    expect(next.areas[0].rooms[0].geometry?.tolerances?.walkway).toBe(1200)
    expect(screen.getByLabelText('Room assessment findings').children.length).toBeGreaterThan(0)
  })

  it('maintains service points with sizes and offsets', () => {
    const { callbacks } = renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: 'Services' }))
    expect(screen.getByLabelText('Service name Outlet A')).toBeTruthy()
    expect(screen.getByLabelText('New service name')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New service name'), { target: { value: 'Gas point' } })
    fireEvent.change(screen.getByLabelText('New service size'), { target: { value: '20mm' } })
    fireEvent.change(screen.getByLabelText('New service source'), { target: { value: 'Gas fitter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add service point' }))
    const next = callbacks.onProjectChange.mock.calls[0][0] as ProjectStructure
    expect(next.services).toHaveLength(2)
    expect(next.services?.[1]).toMatchObject({
      kind: 'electrical',
      name: 'Gas point',
      size: '20mm',
      source: 'Gas fitter',
    })
  })

  it('adds areas, rooms and items to the saved hierarchy', () => {
    const { callbacks } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Add project area' }))
    const withArea = callbacks.onProjectChange.mock.calls[0][0] as ProjectStructure
    expect(withArea.areas).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /Add room to/ }))
    const withRoom = callbacks.onProjectChange.mock.calls[1][0] as ProjectStructure
    expect(withRoom.areas[0].rooms).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /Add joinery item to/ }))
    const withItem = callbacks.onProjectChange.mock.calls[2][0] as ProjectStructure
    expect(withItem.areas[0].rooms[0].items).toHaveLength(2)
  })

  it('opens the detailed project editor and reports undo availability', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Open detailed project editor' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
