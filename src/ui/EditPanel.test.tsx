import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EditPanel } from './EditPanel'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import type {
  BoardPart,
  CarcaseComponent,
  Component,
  CutDef,
  CutId,
  HoleArrayCut,
  MitreCut,
  Scene,
} from '../scene/types'

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

function board(over: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'b1',
    label: 'Left Side',
    length: 560,
    width: 720,
    thickness: 18,
    grain: 'free' as const,
    material: '',
    color: '#c8a97e',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: 'cmp_1',
    driven: true,
    role: 'left-side',
    ...over,
  }
}

const scene: Scene = {
  parts: [board()],
  materials: {},
  hardware: [],
  joints: [],
  components: [cabinet],
}

function renderPanel(over: Record<string, unknown> = {}) {
  const handlers = {
    onUpdate: vi.fn(),
    onDetachPart: vi.fn(),
    onUpdateComponent: vi.fn(),
    parameterFor: vi.fn(() => 'depth' as const),
  }
  render(
    <TooltipProvider>
      <EditPanel
        part={board()}
        scene={scene}
        nextLabel="Board 2"
        onRemove={vi.fn()}
        onUpdateCut={vi.fn()}
        onAddMitre={vi.fn()}
        onRemoveCut={vi.fn()}
        onLinkCuts={vi.fn()}
        onUnlinkCuts={vi.fn()}
        lastPlacedCutId={null}
        dowelTool={null}
        armDowelTool={vi.fn()}
        onUpdateJoint={vi.fn()}
        onRemoveJoint={vi.fn()}
        suggestions={[]}
        onApplySuggestion={vi.fn()}
        onHoverSuggestion={vi.fn()}
        {...handlers}
        {...over}
      />
    </TooltipProvider>,
  )
  return handlers
}

async function typeLength(value: string) {
  const field = screen.getByLabelText('L')
  await userEvent.clear(field)
  await userEvent.type(field, value)
}

describe('EditPanel — editing a driven part', () => {
  afterEach(cleanup)

  it('offers both outcomes when the dimension maps to a parameter', async () => {
    renderPanel()
    await typeLength('600')
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change the cabinet' })).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: 'Detach this part' })).toBeTruthy()
  })

  it('does not apply the edit while the prompt is pending', async () => {
    const h = renderPanel()
    await typeLength('600')
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Detach this part' })).toBeTruthy(),
    )
    // The cabinet owns this part: nothing may change until the user says which they meant.
    expect(h.onUpdate).not.toHaveBeenCalled()
    expect(h.onUpdateComponent).not.toHaveBeenCalled()
    expect(h.onDetachPart).not.toHaveBeenCalled()
  })

  it('offers only detach when no parameter controls the dimension', async () => {
    renderPanel({ parameterFor: vi.fn(() => null) })
    await typeLength('600')
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Detach this part' })).toBeTruthy(),
    )
    expect(screen.queryByRole('button', { name: 'Change the cabinet' })).toBeNull()
  })

  it('pushes the edit into the cabinet parameter', async () => {
    const h = renderPanel()
    await typeLength('600')
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change the cabinet' })).toBeTruthy(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Change the cabinet' }))

    expect(h.onUpdateComponent).toHaveBeenCalledWith('cmp_1', expect.any(Function))
    const updater = h.onUpdateComponent.mock.calls.at(-1)![1] as (c: Component) => Component
    const next = updater(cabinet)
    if (next.kind !== 'carcase') throw new Error('expected a carcase')
    expect(next.params.depth).toBe(600)
    expect(h.onDetachPart).not.toHaveBeenCalled()
  })

  it('detaches and applies the edit in one call', async () => {
    const h = renderPanel()
    await typeLength('600')
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Detach this part' })).toBeTruthy(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Detach this part' }))

    // Two calls would be two reads of a scene that has not re-rendered between them, and the
    // second would regenerate the detachment away — so the edit rides along with the detach.
    expect(h.onDetachPart).toHaveBeenCalledWith('b1', expect.any(Function))
    expect(h.onUpdate).not.toHaveBeenCalled()
    const updater = h.onDetachPart.mock.calls.at(-1)![1] as (p: BoardPart) => BoardPart
    expect(updater(board()).length).toBe(600)
    expect(h.onUpdateComponent).not.toHaveBeenCalled()
  })

  it('applies a detached part edit directly, with no prompt', async () => {
    const h = renderPanel({
      part: board({ driven: false, role: undefined }),
      parameterFor: vi.fn(() => null),
    })
    await typeLength('600')
    await vi.waitFor(() => expect(h.onUpdate).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Detach this part' })).toBeNull()
  })
})

// regenerateComponents rewrites `material` from the cabinet's params on every regeneration, so an
// edit here on a driven part reverted on the next keystroke and left a junk undo entry behind.
describe('EditPanel — material on a driven part', () => {
  afterEach(cleanup)

  const materialField = () => screen.getByPlaceholderText('Material (optional)') as HTMLInputElement

  it('is read-only and names the cabinet that owns it', () => {
    renderPanel()
    expect(materialField().disabled).toBe(true)
    // Scoped: the Shape section carries its own "Grain is set by Base 600." note.
    expect(screen.getByText('Material is set by Base 600.')).toBeTruthy()
  })

  it('is editable on a detached part', () => {
    renderPanel({ part: board({ driven: false, role: undefined }) })
    expect(materialField().disabled).toBe(false)
  })

  it('reports nothing when typed into on a driven part', async () => {
    const h = renderPanel()
    await userEvent.type(materialField(), 'Oak')
    expect(h.onUpdate).not.toHaveBeenCalled()
  })
})

// Every mitre setter spreads `{ ...c }` over whatever cut it is handed. The `axis` one was found
// unguarded while widening CutDef: it compiled only because no other member had an `axis`, and
// HoleArrayCut does — with an incompatible literal union. All three now share one guarded helper.
// The End select and the angle input each drive it, so the guard is checked through two of the
// three call sites rather than asserted from the helper alone.
describe('mitre setters refuse a cut that is not a mitre', () => {
  afterEach(cleanup)

  const mitre: MitreCut = {
    kind: 'mitre',
    id: 'm1' as CutId,
    label: 'Mitre',
    end: '+X',
    axis: 'Z',
    angle: 45,
  }
  const holes: HoleArrayCut = {
    kind: 'hole-array',
    id: 'h1' as CutId,
    label: 'Shelf pins',
    face: '+Z',
    axis: 'U',
    start: { x: 0, y: 37, z: 18 },
    pitch: 32,
    count: 10,
    diameter: 5,
    depth: 12,
  }

  it('leaves a hole array untouched when the End select fires', async () => {
    const onUpdateCut = vi.fn()
    renderPanel({ part: board({ cuts: [mitre] }), onUpdateCut })
    await userEvent.click(screen.getByText('Mitre'))
    // Scoped to the mitre row: EditPanel carries other comboboxes, and reaching for the first one
    // in the whole panel is what made an earlier version of this test look like a Radix limitation.
    const row = screen.getByText('Mitre').closest('div')!.parentElement!
    await userEvent.click(within(row).getAllByRole('combobox')[0])
    await userEvent.click(screen.getByRole('option', { name: '−X end' }))

    const updater = onUpdateCut.mock.calls.at(-1)![2] as (c: CutDef) => CutDef
    expect(updater(holes)).toEqual(holes)
    expect((updater(mitre) as MitreCut).end).toBe('-X')
  })

  it('passes a hole array through untouched, and still patches a mitre', async () => {
    const onUpdateCut = vi.fn()
    renderPanel({ part: board({ cuts: [mitre] }), onUpdateCut })
    // The row is collapsed until its header is clicked, and the angle input carries no
    // accessible name, so it is found by the value it displays.
    await userEvent.click(screen.getByText('Mitre'))
    const angle = screen.getByDisplayValue('45')
    await userEvent.clear(angle)
    await userEvent.type(angle, '30')

    await vi.waitFor(() => expect(onUpdateCut).toHaveBeenCalled())
    const updater = onUpdateCut.mock.calls.at(-1)![2] as (c: CutDef) => CutDef
    expect(updater(holes)).toEqual(holes)
    expect((updater(mitre) as MitreCut).angle).toBe(30)
  })
})

describe('EditPanel — cut size', () => {
  afterEach(cleanup)

  it('shows the cut size when the stored order is not the cutting order', () => {
    renderPanel()
    expect(screen.getByText('Cut size 720 × 560 × 18 mm')).toBeTruthy()
  })

  it('keeps L/W/T on the stored values so the part is still edited as stored', () => {
    renderPanel()
    expect(screen.getByLabelText('L')).toHaveProperty('value', '560')
    expect(screen.getByLabelText('W')).toHaveProperty('value', '720')
  })

  it('stays quiet when the stored order is already the cutting order', () => {
    renderPanel({ part: board({ length: 720, width: 560 }) })
    expect(screen.queryByText(/^Cut size/)).toBeNull()
  })
})

describe('EditPanel — grain', () => {
  afterEach(cleanup)

  it('sets grain on an undriven board', async () => {
    const { onUpdate } = renderPanel({ part: board({ driven: false, role: undefined }) })
    await userEvent.click(screen.getByLabelText('Grain'))
    await userEvent.click(screen.getByRole('option', { name: 'Along width' }))

    expect(onUpdate).toHaveBeenCalled()
    const [id, updater] = onUpdate.mock.calls[0] as [string, (p: BoardPart) => BoardPart]
    expect(id).toBe('b1')
    expect(updater(board({ driven: false })).grain).toBe('width')
  })

  it('a driven board shows its grain read-only and names the owner', () => {
    renderPanel({ part: board({ grain: 'width' }) })
    const trigger = screen.getByLabelText('Grain')
    expect(trigger.getAttribute('data-disabled')).not.toBeNull()
    expect(screen.getByText('Grain is set by Base 600.')).toBeTruthy()
  })

  it('offers no grain control on a dowel', () => {
    renderPanel({
      part: {
        kind: 'cylinder' as const,
        id: 'c1',
        label: 'Dowel 1',
        diameter: 8,
        length: 40,
        material: '',
        color: '#c8a97e',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ' as const,
        cuts: [],
        visible: true,
        parentId: null,
        driven: false,
      },
    })
    expect(screen.queryByLabelText('Grain')).toBeNull()
  })
})
