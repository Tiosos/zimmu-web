import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetEditor, type CabinetTab } from './CabinetEditor'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { setSectionSize, splitSection } from '../scene/editSection'
import { partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import * as downloadModule from './download'
import type { CarcaseComponent, CarcaseParams, Component, ComponentId } from '../scene/types'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const props = (over: Partial<ComponentProps<typeof CabinetEditor>> = {}) => ({
  component: cabinet,
  materials: PRESET_MATERIALS,
  tab: 'section' as CabinetTab,
  onTabChange: vi.fn(),
  selectedSectionId: null,
  onSelectSection: vi.fn(),
  onUpdate: vi.fn(),
  parts: [],
  byId: new Map<ComponentId, Component>(),
  selectedPartId: null,
  onSelectPart: vi.fn(),
  projectName: 'Job',
  ...over,
})

describe('CabinetEditor', () => {
  afterEach(cleanup)

  it('offers the five subtabs a cabinet is described by', () => {
    render(<CabinetEditor {...props()} />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Section',
      'Front',
      'Top',
      'End',
      '3D',
    ])
  })

  // `getAttribute`, not jest-dom's `toHaveAttribute`: this project does not set jest-dom up, and
  // adding it for one assertion is a dependency for a string comparison.
  it('marks the tab it was given as selected', () => {
    render(<CabinetEditor {...props()} />)
    const selected = () =>
      screen
        .getAllByRole('tab')
        .filter((t) => t.getAttribute('aria-selected') === 'true')
        .map((t) => t.textContent)
    expect(selected()).toEqual(['Section'])
    cleanup()
    render(<CabinetEditor {...props({ tab: '3d' })} />)
    expect(selected()).toEqual(['3D'])
  })

  it('reports the tab upward so the viewport can show itself', async () => {
    const onTabChange = vi.fn()
    render(<CabinetEditor {...props({ onTabChange })} />)
    await userEvent.click(screen.getByRole('tab', { name: '3D' }))
    expect(onTabChange).toHaveBeenLastCalledWith('3d')
  })

  // These three said "not built yet" until G2 built them. The placeholder is gone, so the test that
  // pinned it is this one: each tab draws its own projection, named by the view it is.
  it.each(['Front', 'Top', 'End'])('renders a projection for %s', (name) => {
    const tab = name.toLowerCase() as CabinetTab
    render(<CabinetEditor {...props({ tab })} />)
    expect(screen.queryByText(/not built yet/i)).toBeNull()
    expect(screen.getByRole('img', { name: new RegExp(`${name} view`, 'i') })).toBeTruthy()
  })

  // The projection is a selection surface, not a picture: a part it draws must be the selected one
  // when it is selected, and clicking it must reach the same handler the viewport uses. Neither
  // holds unless this component passes both through, and a projection that renders is no evidence
  // that it did.
  it('carries the selection into the projection and a click back out', async () => {
    const onSelectPart = vi.fn()
    const parts = partsOfBase600()
    render(
      <CabinetEditor
        {...props({
          tab: 'front',
          parts,
          byId: new Map<ComponentId, Component>([[cabinet.id, cabinet]]),
          selectedPartId: parts[0].id,
          onSelectPart,
        })}
      />,
    )
    const drawn = screen.getByTestId(`projection-part-${parts[0].id}`)
    expect(drawn.getAttribute('data-selected')).toBe('true')
    await userEvent.click(drawn)
    expect(onSelectPart).toHaveBeenCalledWith(parts[0].id)
  })

  // The 3D tab is the viewport, which lives outside this component precisely so it is never
  // unmounted — so the editor renders no panel of its own for it and App does the showing.
  it('renders no panel of its own for 3D', () => {
    render(<CabinetEditor {...props({ tab: '3d' })} />)
    expect(screen.queryByTestId('cabinet-editor-panel')).toBeNull()
  })

  it('names the cabinet it is editing', () => {
    render(<CabinetEditor {...props()} />)
    expect(screen.getByText('Base 600')).toBeTruthy()
  })

  it.each(['front', 'top', 'end'])('offers SVG and DXF export from the %s tab', (name) => {
    render(<CabinetEditor {...props({ tab: name as CabinetTab })} />)
    expect(screen.getByRole('button', { name: 'SVG' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'DXF' })).toBeTruthy()
  })

  // Section is an editor and 3D is the viewport. Neither is a drawing, and neither is what
  // `buildDrawingSheets` would put on a sheet, so offering the buttons there would offer a file
  // that does not correspond to what is on screen.
  it.each(['section', '3d'])('offers no export from the %s tab, which is not a drawing', (name) => {
    render(<CabinetEditor {...props({ tab: name as CabinetTab })} />)
    expect(screen.queryByRole('button', { name: 'SVG' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'DXF' })).toBeNull()
  })

  // The buttons are wired to the same sheet the drawings deck would show, named by the same
  // function — a button that renders and downloads nothing is the failure a presence test misses.
  it.each([
    ['SVG', 'job-base-600-assembly.svg', 'image/svg+xml'],
    ['DXF', 'job-base-600-assembly.dxf', 'application/dxf'],
  ])('exports the cabinet as %s', async (button, filename, mime) => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    render(
      <CabinetEditor
        {...props({
          tab: 'front',
          projectName: 'Job',
          parts: partsOfBase600(),
          byId: new Map<ComponentId, Component>([[cabinet.id, cabinet]]),
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: button }))
    expect(spy).toHaveBeenCalledWith(expect.any(String), filename, mime)
  })
})

describe('the section toolbar', () => {
  afterEach(cleanup)

  const base = CARCASE_PRESETS[0].params
  const rootId = base.section.id

  // Asserted through the applied params rather than through the SVG: the picture is the elevation's
  // claim, and this toolbar's is that the buttons change the tree.
  const applied = (onUpdate: ReturnType<typeof vi.fn>): CarcaseParams => {
    const updater = onUpdate.mock.calls.at(-1)![0] as (c: Component) => Component
    const next = updater(cabinet)
    if (next.kind !== 'carcase') throw new Error('updater must return a carcase')
    return next.params
  }

  it.each([
    ['Split across', 'horizontal'],
    ['Split down', 'vertical'],
  ])('%s divides the selected section', async (label, axis) => {
    const onUpdate = vi.fn()
    render(<CabinetEditor {...props({ selectedSectionId: rootId, onUpdate })} />)
    await userEvent.click(screen.getByRole('button', { name: label }))

    const content = applied(onUpdate).section.content
    if (content.kind !== 'split') throw new Error('expected a split')
    expect(content.axis).toBe(axis)
    expect(content.children).toHaveLength(2)
  })

  it('merges a split back and keeps the first child’s front', async () => {
    const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const
    const split = splitSection({ ...base.section, front: DOOR }, rootId, 'vertical', 'panel', 2)
    const onUpdate = vi.fn()
    render(
      <CabinetEditor
        {...props({
          component: { ...cabinet, params: { ...base, section: split } },
          selectedSectionId: rootId,
          onUpdate,
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))

    const next = applied(onUpdate).section
    expect(next.content.kind).toBe('leaf')
    expect(next.front).toEqual(DOOR)
  })

  it('sets a fixed size on the selected section', async () => {
    const split = splitSection(base.section, rootId, 'vertical', 'panel', 2)
    if (split.content.kind !== 'split') throw new Error('fixture is not a split')
    const childId = split.content.children[0].id
    const onUpdate = vi.fn()
    render(
      <CabinetEditor
        {...props({
          component: { ...cabinet, params: { ...base, section: split } },
          selectedSectionId: childId,
          onUpdate,
        })}
      />,
    )
    await userEvent.click(screen.getByLabelText('Size'))
    await userEvent.click(screen.getByRole('option', { name: 'Fixed' }))

    const content = applied(onUpdate).section.content
    if (content.kind !== 'split') throw new Error('expected a split')
    expect(content.children[0].size).toEqual({ kind: 'fixed', mm: 300 })
  })

  // The mm field only exists once a size is Fixed — an Equal section has no millimetres to show —
  // so the fixture sets one before asking what it is called.
  it('labels the size by the axis its parent splits on', () => {
    const across = splitSection(base.section, rootId, 'horizontal', 'panel', 2)
    if (across.content.kind !== 'split') throw new Error('fixture is not a split')
    const childId = across.content.children[0].id
    const sized = setSectionSize(across, childId, { kind: 'fixed', mm: 300 })
    render(
      <CabinetEditor
        {...props({
          component: { ...cabinet, params: { ...base, section: sized } },
          selectedSectionId: childId,
        })}
      />,
    )
    // Stacked children are sized by height. Labelling it 'Width' would be wrong half the time.
    expect(screen.getByLabelText('Height', { exact: true })).toBeTruthy()
    expect(screen.queryByLabelText('Width', { exact: true })).toBeNull()
  })

  // The root has no parent to claim space inside, so there is nothing to size and no split to
  // merge. Offering either would be offering a control that cannot do anything.
  it('offers neither Merge nor Size for a root leaf', () => {
    render(<CabinetEditor {...props({ selectedSectionId: rootId })} />)
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
    expect(screen.queryByLabelText('Size')).toBeNull()
  })

  it('offers nothing at all when no section is selected', () => {
    render(<CabinetEditor {...props({ selectedSectionId: null })} />)
    expect(screen.queryByRole('button', { name: 'Split across' })).toBeNull()
    expect(screen.getByText(/pick an opening/i)).toBeTruthy()
  })
})
