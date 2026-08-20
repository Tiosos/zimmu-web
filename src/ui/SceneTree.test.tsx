import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { SceneTree } from './SceneTree'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { BoardPart, Component, GroupComponent, PartId, Selection } from '../scene/types'

function makeBoard(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'board_t1',
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
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
