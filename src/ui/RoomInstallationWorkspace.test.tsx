import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { installationFixture } from '../scene/__fixtures__/installation'
import { RoomInstallationWorkspace } from './RoomInstallationWorkspace'
import { ProjectPanel } from './ProjectPanel'
import {
  acceptInstallation,
  acceptWallFiller,
  installationDraft,
  previewInstallation,
  previewWallFiller,
  wallFillerDraft,
  type InstallationPreview,
  type WallFillerPreview,
} from '../scene/roomInstallation'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open(f = installationFixture()) {
  const props = {
    scene: f.scene,
    project: f.project,
    onApplyRun: vi.fn<(p: InstallationPreview) => boolean>(() => true),
    onApplyFiller: vi.fn<(p: WallFillerPreview) => boolean>(() => true),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
  }
  return { ...render(<RoomInstallationWorkspace {...props} />), props, f }
}
it('stages an ordered wall installation with dimensions and two views before applying', () => {
  const view = open()
  fireEvent.click(screen.getByLabelText('Install Base B (b)'))
  field('Installation name', 'Kitchen base row')
  field('Cabinet spacing', '50')
  field('Wall starting offset', '100')
  click('Preview room installation')
  expect(screen.getByRole('table', { name: 'Installed cabinet dimensions' }).textContent).toContain(
    '100.00–700.00',
  )
  for (const view of ['Plan', 'Elevation'])
    expect(screen.getByRole('img', { name: `${view} installation preview` })).toBeTruthy()
  expect(view.props.onApplyRun).not.toHaveBeenCalled()
  click('Apply room installation')
  expect(view.props.onApplyRun).toHaveBeenCalledTimes(1)
  expect(view.props.onApplyRun.mock.calls[0][0].draft).toMatchObject({
    label: 'Kitchen base row',
    memberIds: ['a', 'b'],
    gap: '50',
  })
})
it('rejects blank values and cancels without writing', () => {
  const view = open()
  field('Wall starting offset', '')
  click('Preview room installation')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  expect(screen.getByRole('button', { name: 'Apply room installation' })).toHaveProperty(
    'disabled',
    true,
  )
  click('Cancel installation changes')
  expect(screen.queryByRole('region', { name: 'Installation preview' })).toBeNull()
  expect(view.props.onApplyRun).not.toHaveBeenCalled()
})
it('invalidates previews after draft edits and blocks project/scene changes until reset', () => {
  const view = open()
  click('Preview room installation')
  field('Member direction', 'reverse')
  expect(screen.queryByRole('region', { name: 'Installation preview' })).toBeNull()
  click('Preview room installation')
  const project = structuredClone(view.props.project)
  project.areas[0].rooms[0].geometry!.walls[0].end.x = 4000
  view.rerender(<RoomInstallationWorkspace {...view.props} project={project} />)
  expect(screen.getByRole('alert').textContent).toContain('project changed')
  expect(screen.getByRole('button', { name: 'Apply room installation' })).toHaveProperty(
    'disabled',
    true,
  )
  click('Reset installation draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('stages wall fillers with their actual calculated dimensions and local edges', () => {
  const view = open()
  click('Wall-fitted fillers')
  field('Installation wall', 'left')
  field('Wall filler name', 'Scribe allowance')
  field('Filler edge y1', 'bare')
  click('Preview wall filler')
  expect(screen.getByRole('region', { name: 'Installation preview' }).textContent).toContain(
    '720.00 × 98.00 × 18.00',
  )
  expect(view.props.onApplyFiller).not.toHaveBeenCalled()
  click('Apply wall filler')
  expect(view.props.onApplyFiller.mock.calls[0][0].draft.edges).toEqual({ y1: null })
})
it('loads saved runs and manages detachment without altering the project', () => {
  const f = installationFixture(),
    d = { ...installationDraft(f.project, f.scene), memberIds: ['a', 'b'] }
  f.scene = acceptInstallation(
    f.scene,
    f.project,
    previewInstallation(f.scene, f.project, d),
    'run',
  )!
  const before = JSON.stringify(f.project),
    view = open(f)
  click('Edit Cabinet installation')
  click('Preview room installation')
  expect(screen.getByText('No changes to save.')).toBeTruthy()
  click('Detach Cabinet installation')
  expect(view.props.onApplyRun.mock.calls[0][0]).toMatchObject({
    targetId: 'run',
    action: 'detach',
  })
  expect(JSON.stringify(f.project)).toBe(before)
})
it('loads saved fillers, stages deletion and wires scene undo/redo', () => {
  const f = installationFixture(),
    d = { ...wallFillerDraft(f.project, f.scene), wallId: 'left' }
  f.scene = acceptWallFiller(
    f.scene,
    f.project,
    previewWallFiller(f.scene, f.project, d),
    'filler',
  )!
  const view = open(f)
  click('Edit Wall filler')
  expect(screen.getByLabelText('Installation wall')).toHaveProperty('value', 'left')
  click('Delete Wall filler')
  expect(view.props.onApplyFiller.mock.calls[0][0]).toMatchObject({
    targetId: 'filler',
    action: 'delete',
  })
  click('Undo scene change')
  click('Redo scene change')
  expect(view.props.onUndo).toHaveBeenCalledOnce()
  expect(view.props.onRedo).toHaveBeenCalledOnce()
})
it('opens installation tools from Project while preserving its original structure view', () => {
  const f = installationFixture()
  render(
    <ProjectPanel
      scene={f.scene}
      project={f.project}
      projectName="Project"
      activeItemId={f.room.items[0].id}
      onChange={vi.fn()}
      onSelectItem={vi.fn()}
      canUndo={false}
      canRedo={false}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onClose={vi.fn()}
      onApplyInstallationPreview={vi.fn(() => true)}
      onApplyWallFillerPreview={vi.fn(() => true)}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Room installation workspace' })).toBeNull()
  click('Room installation')
  expect(screen.getByRole('region', { name: 'Room installation workspace' })).toBeTruthy()
  click('Room and item settings')
  expect(screen.queryByRole('region', { name: 'Room installation workspace' })).toBeNull()
})

it('shows real opening directions in plan and only reference-wall openings in elevation', () => {
  const f = installationFixture()
  f.room.geometry!.openings = [
    {
      id: 'back-window',
      wallId: 'back',
      kind: 'window',
      offset: 100,
      width: 200,
      sill: 800,
      height: 500,
    },
    {
      id: 'side-door',
      wallId: 'left',
      kind: 'door',
      offset: 100,
      width: 800,
      sill: 0,
      height: 2000,
    },
  ]
  open(f)
  click('Preview room installation')
  const plan = screen.getByRole('img', { name: 'Plan installation preview' }),
    elevation = screen.getByRole('img', { name: 'Elevation installation preview' })
  expect(plan.querySelectorAll('[data-opening-id]')).toHaveLength(2)
  const side = plan.querySelector('[data-opening-id="side-door"]')!
  expect(side.getAttribute('x1')).toBe(side.getAttribute('x2'))
  expect(side.getAttribute('y1')).not.toBe(side.getAttribute('y2'))
  expect(elevation.textContent).toContain('window')
  expect(elevation.textContent).not.toContain('door')
})
