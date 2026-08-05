import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import type { BoardPart, BoxCut, CutId, CylinderPart, Part, PartId } from '../scene/types'
import { PART_COLORS } from '../scene/palette'

function makeCut(overrides: Partial<BoxCut> = {}): BoxCut {
  return {
    id: 'cut_1',
    label: 'Dado',
    kind: 'box',
    face: '+Z',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 20, y: 20, z: 10 },
    ...overrides,
  }
}

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
    ...overrides,
  }
}

function makeCylinder(overrides: Partial<CylinderPart> = {}): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'cyl_t1',
    label: 'Dowel 1',
    diameter: 8,
    length: 100,
    material: '',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

function props(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return {
    scene: { parts: [makeBoard()], materials: {}, hardware: [], joints: [] },
    occtReady: true,
    errors: new Map<PartId, string>(),
    pendingIds: new Set<PartId>(),
    nextLabel: 'Board 2',
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    onUpdate: vi.fn(),
    onUpdateCut: vi.fn(),
    onAddMitre: vi.fn(),
    onRemoveCut: vi.fn(),
    onLinkCuts: vi.fn(),
    onUnlinkCuts: vi.fn(),
    lastPlacedCutId: null as CutId | null,
    selectedId: null,
    onSelect: vi.fn(),
    snapActive: false,
    snapPhase: 'idle' as const,
    onSnapToggle: vi.fn(),
    cutActive: false,
    onCutToggle: vi.fn(),
    onToggleVisible: vi.fn(),
    dowelTool: null,
    armDowelTool: vi.fn(),
    onUpdateJoint: vi.fn(),
    onRemoveJoint: vi.fn(),
    jointActive: false,
    onJointToggle: vi.fn(),
    jointStatus: null,
    halfLapActive: false,
    onHalfLapToggle: vi.fn(),
    halfLapStatus: null,
    mortiseTenonActive: false,
    onMortiseTenonToggle: vi.fn(),
    mortiseTenonStatus: null,
    fingerJointActive: false,
    onFingerJointToggle: vi.fn(),
    fingerJointStatus: null,
    tongueGrooveActive: false,
    onTongueGrooveToggle: vi.fn(),
    tongueGrooveStatus: null,
    suggestions: [],
    onApplySuggestion: vi.fn(),
    onHoverSuggestion: vi.fn(),
    ...overrides,
  }
}

describe('Sidebar', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders part label', () => {
    render(<Sidebar {...props()} />)
    expect(screen.getByText('Board 1')).toBeTruthy()
  })

  it('shows empty state when no parts', () => {
    render(
      <Sidebar {...props({ scene: { parts: [], materials: {}, hardware: [], joints: [] } })} />,
    )
    expect(screen.getByText(/No parts/)).toBeTruthy()
  })

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn()
    render(<Sidebar {...props({ onSelect })} />)
    fireEvent.click(screen.getByText('Board 1'))
    expect(onSelect).toHaveBeenCalledWith('board_t1')
  })

  it('calls onAdd when + Board clicked', () => {
    const onAdd = vi.fn()
    render(<Sidebar {...props({ onAdd })} />)
    fireEvent.click(screen.getByText('+ Board'))
    expect(onAdd).toHaveBeenCalledWith('board')
  })

  it('+ Board button is disabled when occtReady is false', () => {
    render(<Sidebar {...props({ occtReady: false })} />)
    expect((screen.getByText('+ Board').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onRemove when delete clicked', () => {
    const onRemove = vi.fn()
    render(<Sidebar {...props({ onRemove })} />)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onRemove).toHaveBeenCalledWith('board_t1')
  })

  it('calls onDuplicate when duplicate clicked', () => {
    const onDuplicate = vi.fn()
    render(<Sidebar {...props({ onDuplicate })} />)
    fireEvent.click(screen.getByTitle('Duplicate'))
    expect(onDuplicate).toHaveBeenCalledWith('board_t1')
  })

  it('calls onToggleVisible when visibility button clicked', () => {
    const onToggleVisible = vi.fn()
    render(<Sidebar {...props({ onToggleVisible })} />)
    fireEvent.click(screen.getByTitle('Hide'))
    expect(onToggleVisible).toHaveBeenCalledWith('board_t1')
  })

  it('shows hollow circle and Show title for hidden part', () => {
    const onToggleVisible = vi.fn()
    render(
      <Sidebar
        {...props({
          onToggleVisible,
          scene: {
            parts: [makeBoard({ visible: false })],
            materials: {},
            hardware: [],
            joints: [],
          },
        })}
      />,
    )
    expect(screen.getByTitle('Show')).toBeTruthy()
  })

  it('shows edit panel when a part is selected', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/Shape/i)).toBeTruthy()
    expect(screen.getByText(/Position/i)).toBeTruthy()
    expect(screen.getByText(/Rotation/i)).toBeTruthy()
  })

  it('EditPanel delete button calls onRemove for the selected part', () => {
    const onRemove = vi.fn()
    render(<Sidebar {...props({ selectedId: 'board_t1', onRemove })} />)
    fireEvent.click(screen.getByTitle('Delete part'))
    expect(onRemove).toHaveBeenCalledWith('board_t1')
  })

  it('renders material input when a part is selected', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByPlaceholderText('Material (optional)')).toBeTruthy()
  })

  it('material input change calls onUpdate with updated material', () => {
    const onUpdate = vi.fn()
    render(<Sidebar {...props({ selectedId: 'board_t1', onUpdate })} />)
    const input = screen.getByPlaceholderText('Material (optional)')
    fireEvent.change(input, { target: { value: 'Plywood' } })
    expect(onUpdate).toHaveBeenCalledOnce()
    const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
    const result = updater(makeBoard())
    expect(result.material).toBe('Plywood')
  })

  it('hides edit panel when nothing is selected', () => {
    render(<Sidebar {...props({ selectedId: null })} />)
    expect(screen.queryByText('▾ Shape')).toBeNull()
  })

  it('shows pending spinner for in-flight parts', () => {
    render(<Sidebar {...props({ pendingIds: new Set(['board_t1']) })} />)
    expect(screen.getByText('⟳')).toBeTruthy()
  })

  it('shows error indicator for failed parts', () => {
    render(<Sidebar {...props({ errors: new Map([['board_t1', 'OCCT failed']]) })} />)
    expect(screen.getByText('⚠')).toBeTruthy()
  })

  it('shows Cuts section header when a part is selected', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/▾ Cuts/)).toBeTruthy()
  })

  it('shows "No cuts" placeholder when part has zero cuts', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/No cuts/i)).toBeTruthy()
  })

  it('renders a cut row when part has one cut', () => {
    const cut: BoxCut = {
      id: 'cut_1',
      label: 'Dado',
      kind: 'box',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }
    const scene = { parts: [makeBoard({ cuts: [cut] })], materials: {}, hardware: [], joints: [] }
    render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
    expect(screen.getByText('Dado')).toBeTruthy()
  })

  it('delete button on cut row calls onRemoveCut', () => {
    const onRemoveCut = vi.fn()
    const cut: BoxCut = {
      id: 'cut_1',
      label: 'Dado',
      kind: 'box',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }
    const scene = { parts: [makeBoard({ cuts: [cut] })], materials: {}, hardware: [], joints: [] }
    render(<Sidebar {...props({ scene, selectedId: 'board_t1', onRemoveCut })} />)
    fireEvent.click(screen.getByTitle('Delete cut'))
    expect(onRemoveCut).toHaveBeenCalledWith('board_t1', 'cut_1')
  })

  describe('CutRow accordion and pairing', () => {
    it('cut row is closed by default when not the last placed cut', () => {
      const scene = {
        parts: [makeBoard({ cuts: [makeCut()] })],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: null })} />)
      expect(screen.queryByText('Size')).toBeNull()
    })

    it('lastPlacedCutId auto-opens the matching cut row', () => {
      const scene = {
        parts: [makeBoard({ cuts: [makeCut()] })],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1' })} />)
      expect(screen.getByText('Size')).toBeTruthy()
    })

    it('clicking the cut row header opens it', () => {
      const scene = {
        parts: [makeBoard({ cuts: [makeCut()] })],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: null })} />)
      fireEvent.click(screen.getByText('Dado'))
      expect(screen.getByText('Size')).toBeTruthy()
    })

    it('shows "Link to cut…" when cut is unpaired and other parts have cuts', () => {
      const other = makeBoard({
        id: 'board_t2',
        label: 'Board 2',
        cuts: [makeCut({ id: 'cut_2', label: 'Shelf End' })],
      })
      const scene = {
        parts: [makeBoard({ cuts: [makeCut()] }), other],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1' })} />)
      expect(screen.getByText('Link to cut…')).toBeTruthy()
    })

    it('shows no link UI when cut is unpaired and no other parts have cuts', () => {
      const scene = {
        parts: [makeBoard({ cuts: [makeCut()] })],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1' })} />)
      expect(screen.queryByText('Link to cut…')).toBeNull()
    })

    it('selecting a cut from the dropdown calls onLinkCuts with correct args', () => {
      const onLinkCuts = vi.fn()
      const other = makeBoard({
        id: 'board_t2',
        label: 'Board 2',
        cuts: [makeCut({ id: 'cut_2', label: 'Shelf End' })],
      })
      const scene = {
        parts: [makeBoard({ cuts: [makeCut()] }), other],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(
        <Sidebar
          {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1', onLinkCuts })}
        />,
      )
      fireEvent.click(screen.getByText('Link to cut…').closest('button')!)
      fireEvent.click(screen.getByRole('option', { name: 'Board 2 › Shelf End' }))
      expect(onLinkCuts).toHaveBeenCalledWith('board_t1', 'cut_1', 'board_t2', 'cut_2')
    })

    it('shows paired status when cut has a valid pairedCutId', () => {
      const cut2 = makeCut({ id: 'cut_2', label: 'Shelf End' })
      const other = makeBoard({ id: 'board_t2', label: 'Board 2', cuts: [cut2] })
      const cut = makeCut({ pairedCutId: 'board_t2:cut_2' })
      const scene = {
        parts: [makeBoard({ cuts: [cut] }), other],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1' })} />)
      expect(screen.getByText(/↔ Board 2 › Shelf End/)).toBeTruthy()
    })

    it('Unlink button calls onUnlinkCuts for a valid pair', () => {
      const onUnlinkCuts = vi.fn()
      const cut2 = makeCut({ id: 'cut_2', label: 'Shelf End' })
      const other = makeBoard({ id: 'board_t2', label: 'Board 2', cuts: [cut2] })
      const cut = makeCut({ pairedCutId: 'board_t2:cut_2' })
      const scene = {
        parts: [makeBoard({ cuts: [cut] }), other],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(
        <Sidebar
          {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1', onUnlinkCuts })}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
      expect(onUnlinkCuts).toHaveBeenCalledWith('board_t1', 'cut_1')
    })

    it('shows "Pair lost" when pairedCutId references a missing cut', () => {
      const cut = makeCut({ pairedCutId: 'board_missing:cut_missing' })
      const scene = { parts: [makeBoard({ cuts: [cut] })], materials: {}, hardware: [], joints: [] }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1' })} />)
      expect(screen.getByText(/Pair lost/)).toBeTruthy()
    })

    it('Unlink button in pair-lost state calls onUnlinkCuts', () => {
      const onUnlinkCuts = vi.fn()
      const cut = makeCut({ pairedCutId: 'board_missing:cut_missing' })
      const scene = { parts: [makeBoard({ cuts: [cut] })], materials: {}, hardware: [], joints: [] }
      render(
        <Sidebar
          {...props({ scene, selectedId: 'board_t1', lastPlacedCutId: 'cut_1', onUnlinkCuts })}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
      expect(onUnlinkCuts).toHaveBeenCalledWith('board_t1', 'cut_1')
    })
  })

  describe('EditPanel hardware section', () => {
    it('does not render a hardware section when no hardware is linked to the selected part', () => {
      const scene = {
        parts: [makeBoard()],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Screw M4',
            qty: 8,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 0,
            notes: '',
            linkedPartIds: [],
          },
        ],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      expect(screen.queryByText(/▾ Hardware/)).toBeNull()
    })

    it('renders linked hardware items in the EditPanel', () => {
      const scene = {
        parts: [makeBoard()],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Corner bracket',
            qty: 4,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 1.5,
            notes: '',
            linkedPartIds: ['board_t1'],
          },
        ],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      expect(screen.getByText(/▾ Hardware/)).toBeTruthy()
      expect(screen.getByText(/Corner bracket × 4 pcs/)).toBeTruthy()
    })

    it('renders only hardware linked to the selected part', () => {
      const scene = {
        parts: [makeBoard(), makeBoard({ id: 'board_t2', label: 'Board 2' })],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Hinge',
            qty: 2,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 0,
            notes: '',
            linkedPartIds: ['board_t1'],
          },
          {
            id: 'hw_2',
            name: 'Dowel',
            qty: 6,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 0,
            notes: '',
            linkedPartIds: ['board_t2'],
          },
        ],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      expect(screen.getByText(/Hinge/)).toBeTruthy()
      expect(screen.queryByText(/Dowel × 6 pcs/)).toBeNull()
    })
  })

  describe('CylinderPart editing', () => {
    it('shows Ø dimension label and not T when a cylinder is selected', () => {
      const scene = { parts: [makeCylinder()], materials: {}, hardware: [], joints: [] }
      render(<Sidebar {...props({ scene, selectedId: 'cyl_t1' })} />)
      expect(screen.getByText('Ø')).toBeTruthy()
      expect(screen.queryByText('T')).toBeNull()
    })

    it('blanking a dowel label falls back to "Dowel", not the board nextLabel', () => {
      const onUpdate = vi.fn()
      const scene = { parts: [makeCylinder()], materials: {}, hardware: [], joints: [] }
      render(<Sidebar {...props({ scene, selectedId: 'cyl_t1', onUpdate })} />)
      const input = screen.getByDisplayValue('Dowel 1')
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)
      const calls = onUpdate.mock.calls
      const [, updater] = calls[calls.length - 1] as [PartId, (p: Part) => Part]
      expect(updater(makeCylinder()).label).toBe('Dowel')
    })
  })

  it('footer shows both + Board and + Dowel buttons', () => {
    render(<Sidebar {...props()} />)
    expect(screen.getByText('+ Board')).toBeTruthy()
    expect(screen.getByText('+ Dowel')).toBeTruthy()
  })

  describe('ColorControl', () => {
    it('renders the custom color input when a part is selected', () => {
      render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
      expect(screen.getByLabelText('Custom color')).toBeTruthy()
    })

    it('does not render the color control when nothing is selected', () => {
      render(<Sidebar {...props({ selectedId: null })} />)
      expect(screen.queryByLabelText('Custom color')).toBeNull()
    })

    it('clicking a preset swatch calls onUpdate with that color', () => {
      const onUpdate = vi.fn()
      render(<Sidebar {...props({ selectedId: 'board_t1', onUpdate })} />)
      fireEvent.click(screen.getByLabelText('Color #8ecae6'))
      expect(onUpdate).toHaveBeenCalledOnce()
      const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
      expect(updater(makeBoard()).color).toBe('#8ecae6')
      // No historyLabel — color edits coalesce in undo history
      expect(onUpdate.mock.calls[0]).toHaveLength(2)
    })

    it('changing the native color input calls onUpdate with the new color', () => {
      const onUpdate = vi.fn()
      render(<Sidebar {...props({ selectedId: 'board_t1', onUpdate })} />)
      fireEvent.change(screen.getByLabelText('Custom color'), {
        target: { value: '#123456' },
      })
      expect(onUpdate).toHaveBeenCalledOnce()
      const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
      expect(updater(makeBoard()).color).toBe('#123456')
      // No historyLabel — color edits coalesce in undo history
      expect(onUpdate.mock.calls[0]).toHaveLength(2)
    })

    it('the swatch matching part.color shows a selected ring', () => {
      render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
      expect(screen.getByLabelText('Color #d4a373').className).toContain('ring-2')
    })

    it('no swatch shows a selected ring when the color is custom', () => {
      const scene = {
        parts: [makeBoard({ color: '#ff0000' })],
        materials: {},
        hardware: [],
        joints: [],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      for (const c of PART_COLORS) {
        expect(screen.getByLabelText(`Color ${c}`).className).not.toContain('ring-2')
      }
    })
  })
})

describe('Sidebar joints panel — rabbeted', () => {
  afterEach(() => cleanup())

  const jointScene = (profile: 'plain' | 'rabbeted') => ({
    parts: [
      makeBoard(),
      makeBoard({ id: 'board_t2', label: 'Board 2', rotation: { x: 0, y: 90, z: 0 } }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'dado' as const,
        id: 'j1',
        label: 'Dado 1',
        housingPartId: 'board_t1',
        housingFace: '+Z' as const,
        housedPartId: 'board_t2',
        housedEnd: '+X' as const,
        offset: 100,
        depth: 8,
        clearance: 0,
        profile,
        tongueThickness: 8,
        rabbetFace: '+Z' as const,
        stopStart: 0,
        stopEnd: 0,
      },
    ],
  })

  it('plain joint hides the tongue controls', () => {
    render(<Sidebar {...props({ scene: jointScene('plain'), selectedId: 'board_t1' })} />)
    expect(screen.queryByText('Tongue')).toBeNull()
  })

  it('rabbeted joint shows the tongue + rabbet-side controls', () => {
    render(<Sidebar {...props({ scene: jointScene('rabbeted'), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Tongue')).toBeTruthy()
    expect(screen.getByText('Rabbet')).toBeTruthy()
  })

  it('shows Stop A / Stop B inputs for the housing part (plain)', () => {
    render(<Sidebar {...props({ scene: jointScene('plain'), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Stop A')).toBeTruthy()
    expect(screen.getByText('Stop B')).toBeTruthy()
  })

  it('keeps Stop A / Stop B visible for a rabbeted joint too', () => {
    render(<Sidebar {...props({ scene: jointScene('rabbeted'), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Stop A')).toBeTruthy()
    expect(screen.getByText('Stop B')).toBeTruthy()
  })
})

describe('Sidebar joints panel — half-lap', () => {
  afterEach(() => cleanup())

  const lapScene = () => ({
    parts: [
      makeBoard(),
      makeBoard({
        id: 'board_t2',
        label: 'Board 2',
        length: 40,
        width: 200,
        position: { x: 40, y: -80, z: 0 },
      }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'halflap' as const,
        id: 'jl',
        label: 'Half-lap 1',
        partAId: 'board_t1',
        partBId: 'board_t2',
        split: 0.5,
        clearance: 0,
      },
    ],
  })

  it('shows Split / Clear inputs for a board in a half-lap', () => {
    render(<Sidebar {...props({ scene: lapScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Split')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('shows the half-lap controls on the OTHER board too (symmetric)', () => {
    render(<Sidebar {...props({ scene: lapScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText('Split')).toBeTruthy()
  })
})

describe('Sidebar joints panel — mortise & tenon', () => {
  afterEach(() => cleanup())

  const mtScene = () => ({
    parts: [
      makeBoard(),
      makeBoard({ id: 'board_t2', label: 'Board 2', rotation: { x: 0, y: 90, z: 0 } }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'mortise-tenon' as const,
        id: 'jm',
        label: 'Mortise & tenon 1',
        mortisePartId: 'board_t1',
        mortiseFace: '+Z' as const,
        tenonPartId: 'board_t2',
        tenonEnd: '+X' as const,
        tenonLength: 20,
        tenonThickness: 8,
        tenonWidth: 40,
        clearance: 0,
        through: false,
        offsetU: 100,
        offsetV: 50,
      },
    ],
  })

  it('shows Length / Thk / Width / Through controls for the mortise board', () => {
    render(<Sidebar {...props({ scene: mtScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Length')).toBeTruthy()
    expect(screen.getByText('Thk')).toBeTruthy()
    expect(screen.getByText('Width')).toBeTruthy()
    expect(screen.getByText('Through')).toBeTruthy()
  })

  it('shows the tenon-side read-only hint on the other board', () => {
    render(<Sidebar {...props({ scene: mtScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText(/Edit from/)).toBeTruthy()
  })
})

describe('Sidebar joints panel — finger joint', () => {
  afterEach(() => cleanup())

  const fjScene = () => ({
    parts: [
      makeBoard({ length: 200, width: 80, thickness: 18 }),
      makeBoard({
        id: 'board_t2',
        label: 'Board 2',
        length: 200,
        width: 80,
        thickness: 18,
        rotation: { x: 0, y: 90, z: 0 },
      }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'finger' as const,
        id: 'jf',
        label: 'Finger joint 1',
        partAId: 'board_t1',
        endA: '+X' as const,
        partBId: 'board_t2',
        endB: '+X' as const,
        fingerCount: 5,
        clearance: 0,
      },
    ],
  })

  it('shows Fingers / Clear controls for the lead board', () => {
    render(<Sidebar {...props({ scene: fjScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Fingers')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('shows the read-only hint on the mating board', () => {
    render(<Sidebar {...props({ scene: fjScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText(/Edit from/)).toBeTruthy()
  })
})

describe('Sidebar joints panel — tongue & groove', () => {
  afterEach(() => cleanup())

  const tgScene = () => ({
    parts: [
      makeBoard({ length: 800, width: 150, thickness: 18 }),
      makeBoard({
        id: 'board_t2',
        label: 'Board 2',
        length: 800,
        width: 150,
        thickness: 18,
        position: { x: 0, y: 160, z: 0 },
      }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'tongue-groove' as const,
        id: 'jtg',
        label: 'Tongue & groove 1',
        groovePartId: 'board_t1',
        grooveEdge: '+Y' as const,
        tonguePartId: 'board_t2',
        tongueEdge: '-Y' as const,
        tongueThickness: 6,
        tongueDepth: 8,
        clearance: 0,
      },
    ],
  })

  it('shows Thk / Depth / Clear controls for the groove board', () => {
    render(<Sidebar {...props({ scene: tgScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Thk')).toBeTruthy()
    expect(screen.getByText('Depth')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('shows the read-only hint on the tongue board', () => {
    render(<Sidebar {...props({ scene: tgScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText(/Edit from/)).toBeTruthy()
  })
})
