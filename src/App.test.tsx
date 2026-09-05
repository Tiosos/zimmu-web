import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup, screen, fireEvent, within } from '@testing-library/react'
import App from './App'
import { PRESET_MATERIALS } from './scene/carcasePresets'
import { cabinet, partsOfBase600, partsOfCarcase } from './geom/__fixtures__/cabinetSheet'
import { legacyToSection } from './scene/migrateSections'
import { defaultInterior, seedInteriors } from './scene/sectionInterior'
import * as downloadModule from './ui/download'
import type { DrawingSheet } from './geom/drawing'
import type { Part, PartId, Selection } from './scene/types'

const mockUndo = vi.fn()
const mockRedo = vi.fn()
const mockOnDuplicate = vi.fn()
const mockOnToggleVisible = vi.fn()
const mockOnRemove = vi.fn()
const mockOnSelect = vi.fn()

let mockSnapActive = false
let mockCutActive = false

vi.mock('./scene/useSnap', () => ({
  useSnap: () => ({
    snapActive: mockSnapActive,
    snapPhase: 'idle' as const,
    sourceFace: null,
    hoveredFace: null,
    activateSnap: vi.fn(),
    cancelSnap: vi.fn(),
    onFaceClick: vi.fn(),
    onFaceHover: vi.fn(),
  }),
}))

vi.mock('./scene/useAddCut', () => ({
  useAddCut: () => ({
    cutActive: mockCutActive,
    lastPlacedCutId: null,
    activateCut: vi.fn(),
    cancelCut: vi.fn(),
    onFaceClick: vi.fn(),
    onFaceHover: vi.fn(),
  }),
}))

const mockUseScene = vi.fn()

vi.mock('./scene/useScene', () => ({
  useScene: (...args: unknown[]) => mockUseScene(...args),
}))

function makeDefaultSceneReturn() {
  return {
    scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
    geometries: new Map(),
    errors: new Map(),
    pendingIds: new Set(),
    selectedId: 'board_test',
    occtReady: true,
    nextLabel: 'Board 1',
    onAdd: vi.fn(),
    onRemove: mockOnRemove,
    onDuplicate: mockOnDuplicate,
    onToggleVisible: mockOnToggleVisible,
    onUpdate: vi.fn(),
    onUpdateCut: vi.fn(),
    onRemoveCut: vi.fn(),
    onLinkCuts: vi.fn(),
    onUnlinkCuts: vi.fn(),
    onSelect: vi.fn(),
    replaceScene: vi.fn(),
    exportStep: vi.fn(),
    onUpdateMaterial: vi.fn(),
    onUpdateHardware: vi.fn(),
    canUndo: true,
    canRedo: false,
    undoLabel: 'Add Board 1',
    redoLabel: null,
    undo: mockUndo,
    redo: mockRedo,
  }
}

const viewportSpy = vi.hoisted(() => ({
  fitRequest: 0,
  selectedIds: [] as readonly PartId[],
}))

// Renders a marker rather than null: App shows and hides the viewport by toggling `display` on the
// wrapper it sits in, so a test asking whether the viewport is showing has to reach that wrapper,
// and the only handle on it is its child.
vi.mock('./render/viewport', () => ({
  Viewport: (props: { fitRequest: number; selectedIds: readonly PartId[] }) => {
    viewportSpy.fitRequest = props.fitRequest
    viewportSpy.selectedIds = props.selectedIds
    return <div data-testid="viewport" />
  },
}))

// The deck App builds, captured where it is handed over. The viewer's own behaviour has its own
// tests; what App alone decides is what goes into the deck.
const drawingsSpy = vi.hoisted(() => ({ sheets: [] as DrawingSheet[] }))

vi.mock('./ui/DrawingViewer', () => ({
  DrawingViewer: (props: { open: boolean; sheets: DrawingSheet[] }) => {
    if (props.open) drawingsSpy.sheets = props.sheets
    return null
  },
}))

vi.mock('./scene/useFile', () => ({
  useFile: () => ({
    fileReady: true,
    fileName: null,
    projectName: 'Test',
    isDirty: false,
    fileError: null,
    newFile: vi.fn(),
    openFile: vi.fn(),
    saveFile: vi.fn(),
    saveAsFile: vi.fn(),
    setProjectName: vi.fn(),
  }),
}))

describe('App keyboard shortcuts', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockSnapActive = false
    mockCutActive = false
    mockUseScene.mockImplementation(makeDefaultSceneReturn)
  })

  it('Delete calls onRemove with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(mockOnRemove).toHaveBeenCalledWith('board_test')
  })

  it('Backspace calls onRemove with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })
    expect(mockOnRemove).toHaveBeenCalledWith('board_test')
  })

  it('Delete does not call onRemove when snap mode is active', async () => {
    mockSnapActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(mockOnRemove).not.toHaveBeenCalled()
  })

  it('Delete does not call onRemove when cut mode is active', async () => {
    mockCutActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(mockOnRemove).not.toHaveBeenCalled()
  })

  it('Ctrl+Z calls undo()', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    })
    expect(mockUndo).toHaveBeenCalledOnce()
  })

  it('Ctrl+Y calls redo() (Safari alias)', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }))
    })
    expect(mockRedo).toHaveBeenCalledOnce()
  })

  it('Ctrl+D calls onDuplicate with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }))
    })
    expect(mockOnDuplicate).toHaveBeenCalledWith('board_test')
  })

  it('H calls onToggleVisible with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).toHaveBeenCalledWith('board_test')
  })

  it('H does not call onToggleVisible when snap mode is active', async () => {
    mockSnapActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).not.toHaveBeenCalled()
  })

  it('H does not call onToggleVisible when cut mode is active', async () => {
    mockCutActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).not.toHaveBeenCalled()
  })

  it('Home requests a camera fit', async () => {
    render(<App />)
    await act(async () => {})
    const before = viewportSpy.fitRequest
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(viewportSpy.fitRequest).toBe(before + 1)
  })

  it('Home inside a text input does not request a fit', async () => {
    render(<App />)
    await act(async () => {})
    const before = viewportSpy.fitRequest
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(viewportSpy.fitRequest).toBe(before)
    input.remove()
  })
})

describe('App BOM integration', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockSnapActive = false
    mockCutActive = false
  })

  it('adds a dowel and lists it in the Dowels BOM tab', async () => {
    // Stateful mock: onAdd('cylinder') pushes a dowel into scene.parts so the
    // BomModal sees it when it opens.
    mockUseScene.mockImplementation(() => {
      const [parts, setParts] = useState<Part[]>([])
      return {
        scene: { parts, materials: {}, hardware: [], joints: [], components: [] },
        geometries: new Map(),
        errors: new Map(),
        pendingIds: new Set(),
        selectedId: null,
        occtReady: true,
        nextLabel: 'Board 1',
        onAdd: (kind: 'board' | 'cylinder') => {
          if (kind === 'cylinder') {
            setParts((prev) => [
              ...prev,
              {
                kind: 'cylinder' as const,
                id: 'dowel_test_1',
                label: 'Dowel 1',
                diameter: 8,
                length: 100,
                material: '',
                color: '#888888',
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                rotationOrder: 'XYZ' as const,
                cuts: [],
                visible: true,
                parentId: null,
                driven: false,
              },
            ])
          }
        },
        onRemove: vi.fn(),
        onDuplicate: vi.fn(),
        onToggleVisible: vi.fn(),
        onUpdate: vi.fn(),
        onUpdateCut: vi.fn(),
        onRemoveCut: vi.fn(),
        onLinkCuts: vi.fn(),
        onUnlinkCuts: vi.fn(),
        onSelect: vi.fn(),
        replaceScene: vi.fn(),
        exportStep: vi.fn(),
        onUpdateMaterial: vi.fn(),
        onUpdateHardware: vi.fn(),
        canUndo: false,
        canRedo: false,
        undoLabel: null,
        redoLabel: null,
        undo: vi.fn(),
        redo: vi.fn(),
      }
    })

    render(<App />)
    await act(async () => {})

    // Add a dowel via the sidebar button
    fireEvent.click(screen.getByText('+ Dowel'))

    // Open the BOM modal via Ctrl+Shift+E
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'E', shiftKey: true, ctrlKey: true, bubbles: true }),
      )
    })

    // Switch to the Dowels tab
    fireEvent.click(await screen.findByRole('tab', { name: 'Dowels' }))

    // Scope assertions to the BOM panel to prove the Dowels tab actually rendered DowelList
    const bomPanel = screen.getByTestId('bom-panel')
    // "Diameter (mm)" is rendered only by DowelList, proving the Dowels tab is active
    expect(within(bomPanel).getByText('Diameter (mm)')).toBeTruthy()
    // The dowel itself appears inside the BOM panel (not just the sidebar)
    expect(within(bomPanel).getByText('Dowel 1')).toBeTruthy()
  })
})

// Neither half of this rule is visible at the CabinetEditor level — the editor is handed a cabinet,
// it does not decide which one. App decides, and App is also the only place that knows the viewport
// is hidden rather than unmounted, so only a test that renders App can see either. The same is
// true of what the selection reaches: the sidebar's own tests pin its derivation, but only App
// shows the selection actually arriving there.
describe('the open cabinet', () => {
  const inside = partsOfBase600()
  const loose: Part = {
    kind: 'board',
    id: 'board_loose',
    label: 'Loose',
    length: 300,
    width: 100,
    thickness: 18,
    grain: 'length',
    material: '',
    color: '#888888',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  }
  const full = {
    parts: [...inside, loose],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components: [cabinet],
  }

  // One divider makes two bays; two adjustable shelves give each bay more than one part of its own.
  const TWO_BAY_SECTION = seedInteriors(legacyToSection([0.5], 0, 600, 18), defaultInterior(2))
  const TWO_BAY_CABINET = { ...cabinet, params: { ...cabinet.params, section: TWO_BAY_SECTION } }
  const TWO_BAY_PARTS = partsOfCarcase(TWO_BAY_CABINET.params)
  const BAYS =
    TWO_BAY_SECTION.content.kind === 'split'
      ? TWO_BAY_SECTION.content.children.map((c) => c.id)
      : []

  let mockScene: typeof full = full
  let mockSelection: Selection | null = null

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockSnapActive = false
    mockCutActive = false
    mockScene = full
    mockSelection = null
    // The spy holds the last render's props, and `[]` is also its resting value — so a test
    // asserting emptiness would pass on a stale reading from the test before it.
    viewportSpy.selectedIds = []
    mockUseScene.mockImplementation(() => ({
      ...makeDefaultSceneReturn(),
      scene: mockScene,
      selection: mockSelection,
      selectedId: mockSelection?.kind === 'part' ? mockSelection.id : null,
      onSelect: mockOnSelect,
      parameterFor: () => null,
      onDetachPart: vi.fn(),
      onUpdateComponent: vi.fn(),
      onAddComponent: vi.fn(),
      onAddCarcase: vi.fn(),
      onAddMitre: vi.fn(),
      onAddJoint: vi.fn(),
      onAddHalfLap: vi.fn(),
      onAddMortiseTenon: vi.fn(),
      onAddFingerJoint: vi.fn(),
      onAddTongueGroove: vi.fn(),
      onUpdateJoint: vi.fn(),
      onRemoveJoint: vi.fn(),
    }))
  })

  // The viewport's wrapper is what App toggles `display` on, and the marker the mock leaves behind
  // is the only handle on it.
  const viewportShowing = () =>
    screen.getByTestId('viewport').parentElement!.style.display !== 'none'
  // '3D' is a tab no other pane offers, so its presence is the editor's.
  const editorOpen = () => screen.queryByRole('tab', { name: '3D' }) !== null

  const mount = async () => {
    const { rerender } = render(<App />)
    await act(async () => {})
    return async (s: Selection | null) => {
      mockSelection = s
      await act(async () => {
        rerender(<App />)
      })
    }
  }

  // The regression the draft's ancestry rule would have introduced: selecting a part made
  // selectedCarcase non-null, and App shows the viewport only while that is null or the tab is 3D,
  // so a click in the 3D viewport replaced the viewport with the Section elevation.
  it('keeps the viewport when a part is selected and no cabinet is open', async () => {
    mockSelection = { kind: 'part', id: inside[0].id }
    render(<App />)
    await act(async () => {})
    expect(editorOpen()).toBe(false)
    expect(viewportShowing()).toBe(true)
  })

  it('keeps an open cabinet open when a part inside it is selected', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    expect(editorOpen()).toBe(true)
    await select({ kind: 'part', id: inside[0].id })
    expect(editorOpen()).toBe(true)
  })

  it('closes the cabinet when the selection moves outside it', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    expect(editorOpen()).toBe(true)
    await select({ kind: 'part', id: loose.id })
    expect(editorOpen()).toBe(false)
    expect(viewportShowing()).toBe(true)
  })

  // Nothing selected is not a selection outside the cabinet: clicking empty space deselects, and
  // being thrown out of the editor by a stray click is not what "stays open" means.
  it('leaves an open cabinet open when the selection is cleared', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    await select(null)
    expect(editorOpen()).toBe(true)
  })

  // The deck is built here, not in the viewer, so only App can put a cabinet in it: without the
  // third argument every carcase is drawn as loose boards and nothing says how they go together.
  // Asserted on the sheets App hands over rather than on what the viewer draws with them — the
  // viewer's own label is its test, and happy-dom does not parse the SVG it injects.
  it('puts an assembly sheet for each carcase in the drawings deck', async () => {
    render(<App />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'File ▾' }))
    fireEvent.click(screen.getByRole('button', { name: '2D Drawings…' }))

    const assemblies = drawingsSpy.sheets.filter((s) => s.kind === 'assembly')
    expect(assemblies).toHaveLength(1)
    const sheet = assemblies[0]
    if (sheet.kind !== 'assembly') throw new Error('unreachable')
    expect(sheet.cabinetLabel).toBe('Base 600')
    // The cabinet's own parts, not none and not the loose board outside it. Front is the view that
    // culls nothing, so it carries one entry per part the cabinet holds.
    const front = sheet.views.find((v) => v.label === 'Front')!
    expect(front.parts).toHaveLength(inside.length)
  })

  // The tab's own export is the deck's other half, and the file it writes is named after the
  // project — which only App knows. `useFile` is mocked with projectName 'Test'.
  it('names a file exported from a projection tab after the project', async () => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    fireEvent.click(screen.getByRole('tab', { name: 'Front' }))
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }))
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      'test-base-600-assembly.svg',
      'image/svg+xml',
    )
  })

  // The open cabinet is remembered by id, so it can name one the scene has since dropped. It is
  // resolved against the scene on every render for exactly this reason.
  it('closes a cabinet the scene no longer holds', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    expect(editorOpen()).toBe(true)
    mockScene = { ...full, parts: [loose], components: [] }
    await select(null)
    expect(editorOpen()).toBe(false)
    expect(viewportShowing()).toBe(true)
  })

  // The regression this guards: with sectionPick alive, the tree and the elevation could hold
  // different opinions about which opening is picked. There is now one place to look.
  it('keeps one selection: picking a section is the selection, not a second piece of state', async () => {
    mockSelection = {
      kind: 'section',
      cabinetId: cabinet.id,
      sectionId: cabinet.params.section.id,
    }
    render(<App />)
    await act(async () => {})
    // The cabinet stays open: a section selection names its own cabinet.
    expect(editorOpen()).toBe(true)
    // And the section tab reads that same selection: the toolbar offers what can be done to it.
    expect(screen.getByRole('button', { name: 'Split across' })).toBeTruthy()
  })

  // The guard's whole reachable domain: the cabinet on screen is derived from the pick, so a
  // resolvable `cabinetId` always matches and only an unresolvable one is rejected. That is not
  // inert — two cabinets built from one preset share the ids in their section trees, so a stale
  // pick can name a live opening in the cabinet that is open, and the guard is the only thing
  // standing between that and editing the wrong bay.
  it('ignores a section selection whose cabinet the scene no longer holds', async () => {
    const select = await mount()
    const sectionId = cabinet.params.section.id
    await select({ kind: 'section', cabinetId: cabinet.id, sectionId })
    expect(screen.getByRole('button', { name: 'Split across' })).toBeTruthy()

    // The same section id under a cabinet that is not the open one. The editor stays open on the
    // cabinet it was open on — so the toolbar is on screen to be asked — and holds no pick.
    await select({ kind: 'section', cabinetId: 'cmp_elsewhere', sectionId })
    expect(editorOpen()).toBe(true)
    expect(screen.queryByRole('button', { name: 'Split across' })).toBeNull()
    // The 3D highlight reads that same guarded pick, so the rejected selection lights up nothing
    // rather than the same-numbered opening of whichever cabinet is open.
    expect(viewportSpy.selectedIds).toEqual([])
  })

  // Sidebar's own tests pin the derivation; this is the assembled app moving from the cabinet to
  // one of its openings on the selection App actually hands the sidebar, with the panel holding
  // that opening's controls still on screen after. `Dividers` is a CarcasePanel field and nothing
  // else App renders has one.
  it('keeps the sidebar carcase panel on screen when an opening is selected', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    expect(screen.getByLabelText('Dividers')).toBeTruthy()
    await select({ kind: 'section', cabinetId: cabinet.id, sectionId: cabinet.params.section.id })
    expect(screen.getByLabelText('Dividers')).toBeTruthy()
    // And it is *that opening's* panel: `Shelves` renders only once an opening resolves, so it is
    // correctly absent under the component selection above.
    expect(screen.getByLabelText('Shelves')).toBeTruthy()
  })

  // Two bays, two shelves each. Base 600 resolves to one opening, and against one opening "the
  // selected opening's parts" and "every opening's parts" are the same set — so a highlight that
  // ignored the pick entirely would pass.
  //
  // What is pinned here is the prop App hands the viewport. The colour the viewport paints with it
  // is covered by no test in this suite: happy-dom has no WebGL, so nothing here renders a mesh.
  it('highlights every part of the selected opening and nothing else', async () => {
    const select = await mount()
    mockScene = { ...full, parts: TWO_BAY_PARTS, components: [TWO_BAY_CABINET] }
    // The SECOND bay, so that find-by-id and take-the-first disagree. `sectionOpenings` returns
    // openings in geometric order, so selecting BAYS[0] would let a `sections[0]` fallback pass —
    // and that fallback is a bug this codebase has already shipped once, silently shelving the
    // wrong bay.
    await select({ kind: 'section', cabinetId: TWO_BAY_CABINET.id, sectionId: BAYS[1] })
    // Both of that bay's shelves, and none of the other bay's. The divider between them belongs to
    // the cabinet rather than to either bay, as do the shell panels and the toe kick.
    const owned = TWO_BAY_PARTS.filter((p) => p.role?.startsWith(`adj-shelf-${BAYS[1]}-`))
    expect(owned).toHaveLength(2)
    expect([...viewportSpy.selectedIds].sort()).toEqual(owned.map((p) => p.id).sort())
  })

  // The chain that resolves an opening's parts throws on a material that states no thickness, so a
  // cabinet the scene cannot build has to highlight nothing rather than take the app down. A width
  // too small for its own panels would not do: that is a validation error the arithmetic below it
  // propagates happily, so it would survive the guard being deleted.
  it('highlights nothing for a cabinet the scene cannot build', async () => {
    const select = await mount()
    mockScene = {
      ...full,
      components: [{ ...cabinet, params: { ...cabinet.params, carcaseMaterial: 'Unobtanium' } }],
    }
    await select({ kind: 'section', cabinetId: cabinet.id, sectionId: cabinet.params.section.id })
    expect(viewportSpy.selectedIds).toEqual([])
  })

  // `null` would leave the editor open too, so what this pins is the selection, not the editor.
  it('writes an elevation pick into the selection, and deselects to the cabinet', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    const sectionId = cabinet.params.section.id
    fireEvent.click(screen.getByTestId(`section-cell-${sectionId}`))
    expect(mockOnSelect).toHaveBeenCalledWith({ kind: 'section', cabinetId: cabinet.id, sectionId })
    fireEvent.click(screen.getByTestId('section-elevation-background'))
    expect(mockOnSelect).toHaveBeenLastCalledWith({ kind: 'component', id: cabinet.id })
  })
})
