import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ProjectPanel } from './ProjectPanel'
import { defaultProject, type ProjectStructure } from '../scene/projectStructure'
import { wallScene } from '../geom/__fixtures__/wallElevation'
import * as drawing from '../geom/drawing'

describe('ProjectPanel', () => {
  afterEach(cleanup)

  it('does not rebuild the wall elevations when it re-renders with unchanged project and scene', () => {
    const spy = vi.spyOn(drawing, 'buildWallElevationSheet')
    const scene = wallScene([])
    const base = defaultProject(scene, 'seed')
    const project: ProjectStructure = {
      ...base,
      areas: base.areas.map((area) => ({
        ...area,
        rooms: area.rooms.map((room) => ({
          ...room,
          geometry: {
            ...room.geometry!,
            walls: [{ id: 'wall', name: 'Kitchen', start: { x: 0, y: 0 }, end: { x: 3983, y: 0 } }],
          },
        })),
      })),
    }
    const props = {
      project,
      scene,
      projectName: 'Job',
      onChange: vi.fn(),
      activeItemId: '',
      onSelectItem: vi.fn(),
      canUndo: false,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onClose: vi.fn(),
    }
    const { rerender } = render(<ProjectPanel {...props} />)
    const first = spy.mock.calls.length
    expect(first).toBeGreaterThan(0)
    rerender(<ProjectPanel {...props} canUndo />)
    expect(spy.mock.calls.length).toBe(first)
    spy.mockRestore()
  })
})
