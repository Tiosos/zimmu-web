import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CarcasePanel } from './CarcasePanel'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { resolvedOf } from '../scene/__fixtures__/resolve'
import { legacyToSection } from '../scene/migrateSections'
import {
  defaultInterior,
  firstInterior,
  sectionInteriors,
  sectionOpenings,
} from '../scene/sectionInterior'
import type { CarcaseComponent, CarcaseParams, Component, Part, SectionId } from '../scene/types'

function carcase(params: Partial<CarcaseParams> = {}): CarcaseComponent {
  return {
    kind: 'carcase',
    id: 'cmp_1',
    label: 'Base 600',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: { ...CARCASE_PRESETS[0].params, ...params },
  }
}

// `selectedSectionId` defaults to the cabinet's first opening, because almost every test here is
// about editing one and the elevation is what supplies it in the app. The tests that are about
// having *no* selection pass null explicitly.
function renderPanel(
  component = carcase(),
  onUpdate = vi.fn(),
  materials = PRESET_MATERIALS,
  selectedSectionId: SectionId | null | undefined = undefined,
  parts: Part[] = [],
) {
  const pick =
    selectedSectionId === undefined
      ? (sectionOpenings(component.params.section, resolvedOf(component.params))[0]?.sectionId ??
        null)
      : selectedSectionId
  render(
    <TooltipProvider>
      <CarcasePanel
        component={component}
        materials={materials}
        parts={parts}
        onUpdate={onUpdate}
        selectedSectionId={pick}
      />
    </TooltipProvider>,
  )
  return onUpdate
}

// Preset 0 is 600 wide on 18 mm stock. Its own section carries no fixed shelf, but these fixtures
// state one by default because the shim's two fields are what they exercise.
const sec = (dividers: number[], fixedShelves = 1) =>
  legacyToSection(dividers, fixedShelves, 600, 18)

// A driven board of the cabinet the fixtures build. Only `parentId`, `role` and `overrides` are
// read — `overridesOf` keeps a board on the strength of those three alone.
const sidePart: Part = {
  kind: 'board',
  id: 'board_1',
  label: 'Left Side',
  length: 560,
  width: 720,
  thickness: 25,
  grain: 'length',
  material: '',
  color: '#888',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: 'cmp_1',
  driven: true,
}

// Where the partitions a set of params describes actually land, as fractions of the width — the
// same reading the divider field shows.
const partitionCentres = (p: CarcaseParams) =>
  resolvedOf(p)
    .divisions.filter((d) => d.axis === 'vertical')
    .map((d) => Number(((d.rect.x0 + d.rect.x1) / 2 / p.width).toFixed(6)))

// The panel reports edits as an updater, matching how onUpdate works everywhere else in useScene.
function appliedParams(onUpdate: ReturnType<typeof vi.fn>, base: CarcaseComponent): CarcaseParams {
  const updater = onUpdate.mock.calls.at(-1)![0] as (c: Component) => Component
  const next = updater(base)
  if (next.kind !== 'carcase') throw new Error('updater must return a carcase')
  return next.params
}

describe('CarcasePanel', () => {
  afterEach(cleanup)

  it('shows the current width', () => {
    renderPanel()
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('600')
  })

  it('reports a width edit through onUpdate', async () => {
    const c = carcase()
    const onUpdate = renderPanel(c)
    const field = screen.getByLabelText('Width')
    await userEvent.clear(field)
    await userEvent.type(field, '900')
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(appliedParams(onUpdate, c).width).toBe(900)
  })

  it('renders the four sections', () => {
    renderPanel()
    for (const s of ['Size', 'Structure', 'Shelving', 'Joinery']) {
      expect(screen.getByRole('button', { name: new RegExp(s, 'i') })).toBeTruthy()
    }
  })

  it('shows a validation error and still renders the offending field', () => {
    renderPanel(carcase({ width: 10 }))
    expect(screen.getByRole('alert').textContent).toContain('width must exceed 2 × thickness')
    // A panel that hides the field you need to fix is unusable.
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('10')
  })

  it('shows no alert for a valid carcase', () => {
    renderPanel()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a back-mode change through onUpdate', async () => {
    const c = carcase()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Back'))
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    expect(appliedParams(onUpdate, c).backMode).toBe('none')
  })

  it('reports a has-top toggle through onUpdate', async () => {
    const c = carcase()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Has top'))
    expect(appliedParams(onUpdate, c).hasTop).toBe(false)
  })

  // Typed one character at a time, the way a user types it. A field that reparses its own text on
  // every keystroke cannot survive an intermediate "0." — the point of the local draft state.
  it('keeps what was typed while a divider list is entered character by character', async () => {
    const c = carcase({ section: sec([]) })
    const onUpdate = renderPanel(c)
    const field = screen.getByLabelText('Dividers') as HTMLInputElement
    await userEvent.type(field, '0.33, 0.66')
    expect(field.value).toBe('0.33, 0.66')
    // Read back through the geometry, not the tree's shape: what the field promises is two
    // partitions centred a third and two thirds of the way across.
    expect(partitionCentres(appliedParams(onUpdate, c))).toEqual([0.33, 0.66])
  })

  it('re-syncs the divider field when the params change from elsewhere', () => {
    const { rerender } = render(
      <TooltipProvider>
        <CarcasePanel
          component={carcase({ section: sec([0.5]) })}
          materials={PRESET_MATERIALS}
          parts={[]}
          onUpdate={vi.fn()}
          selectedSectionId={null}
        />
      </TooltipProvider>,
    )
    rerender(
      <TooltipProvider>
        <CarcasePanel
          component={carcase({ section: sec([0.25, 0.75]) })}
          materials={PRESET_MATERIALS}
          parts={[]}
          onUpdate={vi.fn()}
          selectedSectionId={null}
        />
      </TooltipProvider>,
    )
    expect((screen.getByLabelText('Dividers') as HTMLInputElement).value).toBe('0.25, 0.75')
  })

  // The Dividers field reads divider positions back out of the section tree, and a section
  // percentage is a share of the CLEAR span — so what it displays depends on the side thicknesses.
  // That is the v12/v13 relationship CLAUDE.md states: a v12 divider is a fraction of the gross
  // width while a section percentage is a share of what is left after the sides take their
  // thickness.
  //
  // Asserted as a difference rather than against a number computed here. Recomputing the expected
  // fraction in the test would just be the implementation written twice; what has to be true is
  // that the override reaches the field at all.
  it('reads per-part thickness overrides into the divider field', () => {
    const divided = carcase({ section: sec([0.5], 0) })
    const shown = (parts: Part[]) => {
      renderPanel(divided, vi.fn(), PRESET_MATERIALS, null, parts)
      const value = (screen.getByLabelText(/dividers/i) as HTMLInputElement).value
      cleanup()
      return value
    }
    const override: Part[] = [{ ...sidePart, role: 'left-side', overrides: { thickness: 25 } }]
    expect(shown(override)).not.toBe(shown([]))
  })

  // The shim writes a whole new tree on every edit. Shelving now hangs off the sections in that
  // tree, so a shim that rebuilt it plainly would delete the cabinet's pin rows the moment anyone
  // touched the divider or fixed-shelf field.
  it('keeps the cabinet’s shelving when the shim relays the tree', async () => {
    const c = carcase()
    const before = firstInterior(c.params.section)
    expect(before, 'preset 0 should ship shelving').toBeDefined()
    const onUpdate = renderPanel(c)
    await userEvent.type(screen.getByLabelText('Dividers'), '0.5')
    const after = appliedParams(onUpdate, c).section
    expect(firstInterior(after)).toEqual(before)
    // Two bays, one opening each: the preset ships no fixed shelf, so typing a divider splits its
    // single opening in two rather than four.
    expect(sectionInteriors(after, resolvedOf(appliedParams(onUpdate, c)))).toHaveLength(2)
  })

  // 'legs' is still in the CarcaseParams union so saved files load, but no generator branch
  // implements it — it produced a cabinet identical to 'none' under a label promising otherwise.
  it('does not offer Legs as a base mode', async () => {
    renderPanel()
    await userEvent.click(screen.getByLabelText('Base'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Toe kick', 'Ladder', 'None'])
  })

  it('renders a cabinet saved with the withdrawn legs base', () => {
    renderPanel(carcase({ baseMode: 'legs' }))
    expect(screen.getByLabelText('Base')).toBeTruthy()
  })

  // Every CarcaseParams field must be reachable. A parameter with no control is invisible to the
  // user and silently un-editable forever, and no other test in the suite would notice.
  //
  // The pin fields are gone from this list because they are gone from CarcaseParams: shelving is
  // stated per section now. Editing it needs a selected section, which arrives with the elevation
  // editor.
  it('exposes a control for every CarcaseParams field', () => {
    renderPanel()
    const labels = [
      'Width',
      'Height',
      'Depth',
      'Material',
      'Has top',
      'Back',
      'Back material',
      'Base',
      'Toe-kick height',
      'Toe-kick setback',
      'Dividers',
      'Fixed shelves',
      'Joint method',
    ]
    for (const label of labels) {
      expect(screen.getByLabelText(label), `no control for "${label}"`).toBeTruthy()
    }
  })
})

describe('CarcasePanel shelving', () => {
  afterEach(cleanup)

  // Two bays and no fixed shelf: two openings side by side, which is the smallest cabinet where
  // "edits the one you picked and not the other" means anything.
  const twoBays = () => carcase({ section: sec([0.5], 0) })

  const shelvesOf = (params: CarcaseParams) =>
    sectionOpenings(params.section, resolvedOf(params)).map((o) => o.spec?.adjustable.shelves)

  // DimInput commits on change behind a 150 ms debounce, so an assertion made straight after
  // typing would read the params before the edit reached them.
  async function typeInto(label: string, text: string, onUpdate: ReturnType<typeof vi.fn>) {
    const before = onUpdate.mock.calls.length
    const field = screen.getByLabelText(label)
    await userEvent.clear(field)
    await userEvent.type(field, text)
    await waitFor(() => expect(onUpdate.mock.calls.length).toBeGreaterThan(before))
  }

  // The whole point of the stage, stated at the UI: one opening's shelving is not the cabinet's.
  it('gives shelves to the opening picked and to no other', async () => {
    const c = twoBays()
    const onUpdate = renderPanel(c)
    await typeInto('Shelves', '3', onUpdate)
    // `undefined`, not `0`: the opening that was not picked is left with no spec at all, rather
    // than being given an empty one as a side effect of editing its neighbour.
    expect(shelvesOf(appliedParams(onUpdate, c))).toEqual([3, undefined])
  })

  // The panel edits whichever section the elevation selected — it holds no pick of its own, so the
  // second opening is reached by handing its id in, not by a control inside the panel.
  it('edits the section the elevation selected', async () => {
    const c = twoBays()
    const [, second] = sectionOpenings(c.params.section, resolvedOf(c.params))
    const onUpdate = renderPanel(c, vi.fn(), PRESET_MATERIALS, second.sectionId)
    await typeInto('Shelves', '2', onUpdate)
    expect(shelvesOf(appliedParams(onUpdate, c))).toEqual([undefined, 2])
  })

  // An opening that has never been shelved has no spec at all. Typing one number must not leave
  // the other five undefined, so the first edit creates the whole default and changes one field.
  it('gives a bare opening the whole default spec on its first edit', async () => {
    const bare = carcase({ section: legacyToSection([], 0, 600, 18) })
    expect(sectionOpenings(bare.params.section, resolvedOf(bare.params))[0].spec).toBeUndefined()

    const onUpdate = renderPanel(bare)
    await typeInto('Shelves', '1', onUpdate)

    const opened = sectionOpenings(
      appliedParams(onUpdate, bare).section,
      resolvedOf(appliedParams(onUpdate, bare)),
    )
    expect(opened[0].spec).toEqual(defaultInterior(1))
  })

  it('exposes a control for every field of a section interior', () => {
    renderPanel(twoBays())
    const labels = ['Shelves', 'Pin count', 'Adjustable rows', 'Pin setback', 'Pin back setback']
    for (const label of labels) {
      expect(screen.getByLabelText(label), `no control for "${label}"`).toBeTruthy()
    }
  })

  // The elevation *is* the picker now. Two ways to choose an opening is one way to choose the
  // wrong one, and the dropdown was the second: it held a pick of its own that the elevation's
  // selection could disagree with.
  it('no longer offers an opening dropdown', () => {
    renderPanel(twoBays())
    expect(screen.queryByLabelText('Opening')).toBeNull()
  })

  // With nothing selected the panel has nothing to edit and must say so, rather than falling back
  // to the first opening — which is what the dropdown did, and what silently shelved the wrong bay.
  it('says to pick an opening in the elevation when none is selected', () => {
    renderPanel(twoBays(), vi.fn(), PRESET_MATERIALS, null)
    expect(screen.getByText(/pick an opening in the elevation to shelve it/i)).toBeTruthy()
    expect(screen.queryByLabelText('Shelves')).toBeNull()
  })
})

describe('CarcasePanel fronts', () => {
  afterEach(cleanup)

  const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const
  const twoBays = () => carcase({ section: sec([0.5], 0) })
  const withDoor = () => carcase({ section: { ...sec([], 0), front: DOOR } })

  const frontsOf = (params: CarcaseParams) =>
    sectionOpenings(params.section, resolvedOf(params)).map((o) => o.section.front?.kind)

  it('gives a front to the opening picked and to no other', async () => {
    const c = twoBays()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Front'))
    await userEvent.click(screen.getByRole('option', { name: 'Door' }))
    expect(frontsOf(appliedParams(onUpdate, c))).toEqual(['door', undefined])
  })

  it('offers None, which removes the front rather than storing an empty one', async () => {
    const c = withDoor()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Front'))
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    expect(frontsOf(appliedParams(onUpdate, c))).toEqual([undefined])
  })

  it('exposes the cabinet-wide mount and reveal', () => {
    renderPanel(twoBays())
    expect(screen.getByLabelText('Mount')).toBeTruthy()
    expect(screen.getByLabelText('Reveal')).toBeTruthy()
  })

  // Hinge is meaningless on a pair — each leaf is hinged on its own outer edge — so offering it
  // there would be a field that is wrong half the time.
  it('offers a hinge side only for a single-leaf door', () => {
    renderPanel(withDoor())
    expect(screen.getByLabelText('Hinge')).toBeTruthy()
    cleanup()
    renderPanel(
      carcase({ section: { ...sec([], 0), front: { kind: 'door', leaves: 2, hinge: 'left' } } }),
    )
    expect(screen.queryByLabelText('Hinge')).toBeNull()
  })

  // Leaves and hinge belong to a door and to nothing else; a drawer front has neither.
  it('offers neither leaves nor hinge for a front that is not a door', () => {
    renderPanel(carcase({ section: { ...sec([], 0), front: { kind: 'drawer-front' } } }))
    expect(screen.queryByLabelText('Leaves')).toBeNull()
    expect(screen.queryByLabelText('Hinge')).toBeNull()
  })

  it('writes the mount to the cabinet, not to the opening', async () => {
    const c = twoBays()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Mount'))
    await userEvent.click(screen.getByRole('option', { name: 'Inset' }))
    expect(appliedParams(onUpdate, c).frontMount).toBe('inset')
  })
})
