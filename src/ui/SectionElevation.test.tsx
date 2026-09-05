import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionElevation } from './SectionElevation'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { legacyToSection } from '../scene/migrateSections'
import { sectionOpenings } from '../scene/sectionInterior'
import { setSectionSize, splitSection } from '../scene/editSection'
import { resolvedOf } from '../scene/__fixtures__/resolve'
import type { CarcaseParams, Part } from '../scene/types'

const base = CARCASE_PRESETS[0].params
const divided = (): CarcaseParams => ({ ...base, section: legacyToSection([0.5], 0, 600, 18) })

const draw = (
  p: CarcaseParams,
  selected: string | null = null,
  onSelect = vi.fn(),
  parts: Part[] = [],
) => {
  render(
    <SectionElevation
      params={p}
      materials={PRESET_MATERIALS}
      parts={parts}
      componentId="cmp_1"
      selected={selected}
      onSelect={onSelect}
    />,
  )
  return onSelect
}

describe('SectionElevation', () => {
  afterEach(cleanup)

  it('draws one cell per leaf and one bar per division', () => {
    draw(divided())
    expect(screen.getAllByTestId(/^section-cell-/)).toHaveLength(2)
    expect(screen.getAllByTestId(/^section-division-/)).toHaveLength(1)
  })

  it('selects the section a cell stands for', async () => {
    const p = divided()
    const onSelect = draw(p)
    const ids = sectionOpenings(p.section, resolvedOf(p)).map((o) => o.sectionId)
    await userEvent.click(screen.getByTestId(`section-cell-${ids[0]}`))
    expect(onSelect).toHaveBeenCalledWith(ids[0])
  })

  it('marks the selected cell and no other', () => {
    const p = divided()
    const [first] = sectionOpenings(p.section, resolvedOf(p))
    draw(p, first.sectionId)
    const marked = screen
      .getAllByTestId(/^section-cell-/)
      .filter((c) => c.getAttribute('data-selected') === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-testid')).toBe(`section-cell-${first.sectionId}`)
  })

  // Carcase z runs up and SVG y runs down. Getting that backwards draws an upside-down cabinet that
  // looks plausible until one is asymmetric — so the fixture is one that is. Read off the rendered
  // attributes, never the component's internals: the claim is about what the user sees.
  it('draws the cabinet the right way up', () => {
    const root = legacyToSection([], 0, 600, 18)
    const split = splitSection(root, root.id, 'horizontal', 'panel', 2)
    if (split.content.kind !== 'split') throw new Error('fixture is not a split')
    // The lower child fixed short, so the two cells cannot be mistaken for each other.
    const lopsided = setSectionSize(split, split.content.children[0].id, { kind: 'fixed', mm: 150 })
    const p: CarcaseParams = { ...base, section: lopsided }
    draw(p)

    // `sectionOpenings` orders bottom-left first, so [0] is the low one in carcase space.
    const [low, high] = sectionOpenings(p.section, resolvedOf(p))
    expect(low.rect.z0).toBeLessThan(high.rect.z0)

    const yOf = (id: string) => Number(screen.getByTestId(`section-cell-${id}`).getAttribute('y'))
    // Lower in the cabinet is further *down* the SVG, which is a larger y.
    expect(yOf(low.sectionId)).toBeGreaterThan(yOf(high.sectionId))
  })

  it('renders nothing rather than throwing for a cabinet that does not build', () => {
    draw({ ...base, width: 5 })
    expect(screen.queryAllByTestId(/^section-cell-/)).toEqual([])
  })

  // A click on the frame rather than on a cell clears the selection: there has to be a way back to
  // "nothing selected", and the panel says what to do when there is none.
  it('clears the selection when the background is clicked', async () => {
    const p = divided()
    const onSelect = draw(p, sectionOpenings(p.section, resolvedOf(p))[0].sectionId)
    await userEvent.click(screen.getByTestId('section-elevation-background'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  // A 25 mm left side beside an 18 mm right one makes the clear opening 600 - 25 - 18 = 557. Drawn
  // from an empty override map it reads 564, and the elevation shows an opening the boards do not
  // have.
  it('draws the opening the overrides actually produce', () => {
    const parts: Part[] = [
      {
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
        role: 'left-side',
        // The only line that matters. `roleThicknessFor` returns an explicit override before it
        // ever looks at a material, so naming one here would be dead weight.
        overrides: { thickness: 25 },
      },
    ]
    draw(base, null, vi.fn(), parts)
    const cell = screen.getAllByTestId(/^section-cell-/)[0]
    expect(Number(cell.getAttribute('width'))).toBeCloseTo(557, 3)
  })

  // The tree names an opening and the elevation has to draw the same number, so this pins the
  // ORDER both read out of `sectionOpenings`, not a constant. The fixture is a full-width top over
  // two bottom bays: sorted by x0 then z0 that reads bottom-left, top, bottom-right, while a walk
  // of the tree visits both bottom bays first. A two-bay cabinet cannot tell the two apart —
  // there they agree.
  it('numbers each opening in the order sectionOpenings returns them', () => {
    const root = legacyToSection([], 0, 600, 18)
    const stacked = splitSection(root, root.id, 'horizontal', 'panel', 2)
    if (stacked.content.kind !== 'split') throw new Error('fixture is not a split')
    const p: CarcaseParams = {
      ...base,
      section: splitSection(stacked, stacked.content.children[0].id, 'vertical', 'panel', 2),
    }
    draw(p)

    const labels = [...screen.getByRole('img').querySelectorAll('text')]
    expect(labels).toHaveLength(3)
    // Each number is read off the cell it lands in, never off document order: cells numbered
    // backwards still read 1, 2, 3 down the DOM.
    const labelIn = (cell: Element) => {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(cell.getAttribute(a)))
      return labels.find((t) => {
        const lx = Number(t.getAttribute('x'))
        const ly = Number(t.getAttribute('y'))
        return lx >= x && lx <= x + w && ly >= y && ly <= y + h
      })?.textContent
    }
    const numbers = sectionOpenings(p.section, resolvedOf(p)).map((o) =>
      labelIn(screen.getByTestId(`section-cell-${o.sectionId}`)),
    )
    expect(numbers).toEqual(['1', '2', '3'])
  })
})
