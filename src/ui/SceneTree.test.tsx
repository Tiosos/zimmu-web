import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { SceneTree } from './SceneTree'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { legacyToSection } from '../scene/migrateSections'
import { defaultInterior, seedInteriors } from '../scene/sectionInterior'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import type { BoardPart, Component, GroupComponent, PartId, Selection } from '../scene/types'

function makeBoard(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'board_t1',
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    grain: 'free' as const,
    material: '',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<GroupComponent> = {}): GroupComponent {
  return {
    kind: 'group',
    id: 'cmp_1',
    label: 'Group 1',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    ...overrides,
  }
}

function props(overrides: Partial<Parameters<typeof SceneTree>[0]> = {}) {
  return {
    components: [] as Component[],
    parts: [makeBoard()],
    selection: null as Selection | null,
    onSelect: vi.fn(),
    onToggleVisible: vi.fn(),
    errors: new Map<PartId, string>(),
    pendingIds: new Set<PartId>(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    materials: PRESET_MATERIALS,
    ...overrides,
  }
}

function renderTree(overrides: Partial<Parameters<typeof SceneTree>[0]> = {}) {
  return render(
    <TooltipProvider>
      <SceneTree {...props(overrides)} />
    </TooltipProvider>,
  )
}

describe('SceneTree', () => {
  afterEach(cleanup)

  it('renders a part inside the subtree of its parent component', () => {
    renderTree({
      components: [makeGroup()],
      parts: [makeBoard({ id: 'child', label: 'Child', parentId: 'cmp_1' })],
    })
    const subtree = screen.getByTestId('subtree-cmp_1')
    expect(within(subtree).getByTestId('node-child')).toBeTruthy()
  })

  it('renders a loose part outside every component subtree', () => {
    renderTree({
      components: [makeGroup()],
      parts: [makeBoard({ id: 'loose', label: 'Loose', parentId: null })],
    })
    const subtree = screen.getByTestId('subtree-cmp_1')
    expect(within(subtree).queryByTestId('node-loose')).toBeNull()
    expect(screen.getByTestId('node-loose')).toBeTruthy()
  })

  it('nests a component under its parent component', () => {
    renderTree({
      components: [makeGroup(), makeGroup({ id: 'cmp_2', label: 'Group 2', parentId: 'cmp_1' })],
      parts: [],
    })
    const subtree = screen.getByTestId('subtree-cmp_1')
    expect(within(subtree).getByTestId('node-cmp_2')).toBeTruthy()
  })

  it('marks a driven part with data-driven="true"', () => {
    renderTree({ parts: [makeBoard({ driven: true })] })
    expect(screen.getByTestId('node-board_t1').getAttribute('data-driven')).toBe('true')
  })

  it('marks a detached part with data-driven="false"', () => {
    renderTree({ parts: [makeBoard({ driven: false })] })
    expect(screen.getByTestId('node-board_t1').getAttribute('data-driven')).toBe('false')
  })

  it('reports a component selection when a component row is clicked', () => {
    const onSelect = vi.fn()
    renderTree({ components: [makeGroup()], parts: [], onSelect })
    fireEvent.click(screen.getByTestId('node-cmp_1'))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'component', id: 'cmp_1' })
  })

  it('reports a part selection when a part row is clicked', () => {
    const onSelect = vi.fn()
    renderTree({ onSelect })
    fireEvent.click(screen.getByTestId('node-board_t1'))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'part', id: 'board_t1' })
  })

  it('collapsing a component hides its children and leaves loose parts alone', () => {
    renderTree({
      components: [makeGroup()],
      parts: [
        makeBoard({ id: 'child', label: 'Child', parentId: 'cmp_1' }),
        makeBoard({ id: 'loose', label: 'Loose', parentId: null }),
      ],
    })
    fireEvent.click(screen.getByLabelText('Collapse Group 1'))
    expect(screen.queryByTestId('node-child')).toBeNull()
    expect(screen.getByTestId('node-loose')).toBeTruthy()
    expect(screen.getByLabelText('Expand Group 1')).toBeTruthy()
  })

  it('re-expanding a collapsed component shows its children again', () => {
    renderTree({
      components: [makeGroup()],
      parts: [makeBoard({ id: 'child', label: 'Child', parentId: 'cmp_1' })],
    })
    fireEvent.click(screen.getByLabelText('Collapse Group 1'))
    fireEvent.click(screen.getByLabelText('Expand Group 1'))
    expect(screen.getByTestId('node-child')).toBeTruthy()
  })

  it('the visibility button reports the node it belongs to', () => {
    const onToggleVisible = vi.fn()
    renderTree({ components: [makeGroup()], parts: [], onToggleVisible })
    fireEvent.click(within(screen.getByTestId('node-cmp_1')).getByTitle('Hide'))
    expect(onToggleVisible).toHaveBeenCalledWith({ kind: 'component', id: 'cmp_1' })
  })

  it('the visibility button does not also select the row', () => {
    const onSelect = vi.fn()
    renderTree({ onSelect })
    fireEvent.click(within(screen.getByTestId('node-board_t1')).getByTitle('Hide'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('the chevron does not also select the row', () => {
    const onSelect = vi.fn()
    renderTree({ components: [makeGroup()], parts: [], onSelect })
    fireEvent.click(screen.getByLabelText('Collapse Group 1'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the selected component row', () => {
    renderTree({
      components: [makeGroup()],
      parts: [],
      selection: { kind: 'component', id: 'cmp_1' },
    })
    expect(screen.getByTestId('node-cmp_1').className).toContain('bg-secondary')
  })

  it('marks the selected part row', () => {
    renderTree({ selection: { kind: 'part', id: 'board_t1' } })
    expect(screen.getByTestId('node-board_t1').className).toContain('bg-secondary')
  })
})

describe('selection is exposed for assertion, not only styled', () => {
  afterEach(cleanup)

  it('marks the selected component row', () => {
    renderTree({
      components: [makeGroup()],
      parts: [makeBoard({ id: 'loose' })],
      selection: { kind: 'component', id: 'cmp_1' },
    })
    expect(screen.getByTestId('node-cmp_1').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('node-loose').getAttribute('data-selected')).toBe('false')
  })

  it('marks the selected part row', () => {
    renderTree({
      components: [makeGroup()],
      parts: [makeBoard({ id: 'loose' })],
      selection: { kind: 'part', id: 'loose' },
    })
    expect(screen.getByTestId('node-loose').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('node-cmp_1').getAttribute('data-selected')).toBe('false')
  })
})

describe('driven and detached parts are visually distinguishable', () => {
  afterEach(cleanup)

  it('marks a part inside a component as driven or detached in the row', () => {
    renderTree({
      components: [makeGroup()],
      parts: [
        makeBoard({ id: 'owned', label: 'Left Side', parentId: 'cmp_1', driven: true }),
        makeBoard({ id: 'mine', label: 'My Shelf', parentId: 'cmp_1', driven: false }),
      ],
    })
    // A detached part carries a visible marker, not just an attribute: after a role disappears
    // and returns, the user can end up with two coincident boards and needs to tell them apart.
    expect(screen.getByTestId('node-mine').textContent).toContain('detached')
    expect(screen.getByTestId('node-owned').textContent).not.toContain('detached')
  })

  it('does not mark a top-level part as detached', () => {
    renderTree({ components: [], parts: [makeBoard({ id: 'loose', driven: false })] })
    // "Detached" only means something relative to an owner; a loose board was never driven.
    expect(screen.getByTestId('node-loose').textContent).not.toContain('detached')
  })
})

// All three presets resolve to exactly one opening, so a fixture taken from CARCASE_PRESETS alone
// would pass whether or not the grouping worked. One divider makes two bays; one adjustable shelf
// in each gives every opening a part of its own to own.
const TWO_BAY_SECTION = seedInteriors(legacyToSection([0.5], 0, 600, 18), defaultInterior(1))
const TWO_BAY = { ...CARCASE_PRESETS[0].params, section: TWO_BAY_SECTION }
const TWO_BAY_PARTS = partsOfCarcase(TWO_BAY)
const TWO_BAY_CABINET = { ...cabinet, params: TWO_BAY }

// The split's children, left to right for a vertical split — so `Opening 1` is BAYS[0], which is
// what the collapse test below holds. The ternary is narrowing; the fixture is always a split.
const BAYS =
  TWO_BAY_SECTION.content.kind === 'split' ? TWO_BAY_SECTION.content.children.map((c) => c.id) : []

const shelfOf = (sectionId: string) =>
  TWO_BAY_PARTS.find((p) => p.role === `adj-shelf-${sectionId}-0`)!

const divider = TWO_BAY_PARTS.find((p) => p.role?.startsWith('division-'))!

describe('a cabinet expands into its openings', () => {
  afterEach(cleanup)

  it('nests a cabinet’s parts under the opening that owns them', () => {
    renderTree({ components: [TWO_BAY_CABINET], parts: TWO_BAY_PARTS })
    expect(screen.getAllByTestId(/^node-sec_/)).toHaveLength(2)
    const first = screen.getByTestId(`subtree-${BAYS[0]}`)
    expect(within(first).getByTestId(`node-${shelfOf(BAYS[0]).id}`)).toBeTruthy()
    expect(within(first).queryByTestId(`node-${shelfOf(BAYS[1]).id}`)).toBeNull()
  })

  it('puts a divider among the carcase parts, not inside an opening', () => {
    renderTree({ components: [TWO_BAY_CABINET], parts: TWO_BAY_PARTS })
    // `division-` names the section that was split, which is always internal — so the partition
    // between two bays belongs to neither of them.
    expect(screen.getByTestId(`node-${divider.id}`).closest('[data-testid^="subtree-sec_"]')).toBe(
      null,
    )
  })

  it('selects the opening when its row is clicked', () => {
    const onSelect = vi.fn()
    renderTree({ components: [TWO_BAY_CABINET], parts: TWO_BAY_PARTS, onSelect })
    fireEvent.click(screen.getByTestId(`node-${BAYS[0]}`))
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'section',
      cabinetId: 'cmp_1',
      sectionId: BAYS[0],
    })
  })

  it('collapsing an opening hides its parts and leaves the other one alone', () => {
    renderTree({ components: [TWO_BAY_CABINET], parts: TWO_BAY_PARTS })
    fireEvent.click(screen.getByLabelText('Collapse Opening 1'))
    expect(screen.queryByTestId(`node-${shelfOf(BAYS[0]).id}`)).toBeNull()
    expect(screen.getByTestId(`node-${shelfOf(BAYS[1]).id}`)).toBeTruthy()
    expect(screen.getByLabelText('Expand Opening 1')).toBeTruthy()
  })

  it('marks the selected opening row', () => {
    renderTree({
      components: [TWO_BAY_CABINET],
      parts: TWO_BAY_PARTS,
      selection: { kind: 'section', cabinetId: 'cmp_1', sectionId: BAYS[1] },
    })
    expect(screen.getByTestId(`node-${BAYS[1]}`).getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId(`node-${BAYS[0]}`).getAttribute('data-selected')).toBe('false')
  })

  it('renders an unbuildable cabinet’s parts flat rather than throwing', () => {
    // A material the scene no longer defines cannot say how thick it is, and `roleThicknessFor` is
    // fatal by design — so the opening rectangle this grouping needs cannot be resolved at all.
    const broken = { ...TWO_BAY_CABINET, params: { ...TWO_BAY, carcaseMaterial: 'Unobtanium' } }
    renderTree({ components: [broken], parts: TWO_BAY_PARTS })
    expect(screen.queryAllByTestId(/^node-sec_/)).toEqual([])
    expect(screen.getByTestId(`node-${shelfOf(BAYS[0]).id}`)).toBeTruthy()
    expect(screen.getByTestId(`node-${divider.id}`)).toBeTruthy()
  })
})
