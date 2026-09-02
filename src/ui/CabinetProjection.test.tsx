import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetProjection } from './CabinetProjection'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { carcaseCuts, carcaseHoleArrays } from '../scene/carcaseRoles'
import { roleThicknessFor } from '../scene/resolveThickness'
import { jointKindFor } from '../scene/resolveJointKind'
import type { Component, ComponentId, Part } from '../scene/types'
import { cabinet, partsOfBase600, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

const parts: Part[] = partsOfBase600()

const roleId = (role: string): string => parts.find((p) => p.role === role)!.id

// The same cabinet with the machining the generator gives it: the toe-kick notch in its sides and
// the pin rows bored for its shelf. `partsOfCarcase` builds parts with no cuts, so a pane test that
// wants a cut outline or a bore has to attach them from the same functions the generator uses.
const machined = (): Part[] => {
  const p = cabinet.params
  const thicknessOf = roleThicknessFor(p, PRESET_MATERIALS, new Map())
  const kindOf = jointKindFor([], cabinet.id)
  return partsOfCarcase(p).map((part) =>
    part.kind === 'board' && part.role !== undefined
      ? {
          ...part,
          cuts: [
            ...carcaseCuts(p, thicknessOf, part.role),
            ...carcaseHoleArrays(p, thicknessOf, kindOf, part.role),
          ],
        }
      : part,
  )
}

const drawParts = (view: 'Front' | 'Top' | 'End', list: Part[]) =>
  render(
    <CabinetProjection
      view={view}
      parts={list}
      byId={byId}
      cabinet={cabinet}
      materials={PRESET_MATERIALS}
      selectedId={null}
      onSelect={vi.fn()}
    />,
  )

const draw = (
  view: 'Front' | 'Top' | 'End' = 'Front',
  onSelect = vi.fn(),
  selectedId: string | null = null,
) => {
  render(
    <CabinetProjection
      view={view}
      parts={parts}
      byId={byId}
      cabinet={cabinet}
      materials={PRESET_MATERIALS}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  )
  return onSelect
}

describe('CabinetProjection', () => {
  afterEach(cleanup)

  it('draws one clickable shape per visible part', () => {
    draw()
    expect(screen.getAllByTestId(/^projection-part-/).length).toBe(parts.length)
  })

  it('selects the part a shape stands for', async () => {
    const onSelect = draw()
    await userEvent.click(screen.getByTestId(`projection-part-${parts[0].id}`))
    expect(onSelect).toHaveBeenCalledWith(parts[0].id)
  })

  it('marks the selected part and no other', () => {
    draw('Front', vi.fn(), parts[1].id)
    const marked = screen
      .getAllByTestId(/^projection-part-/)
      .filter((el) => el.getAttribute('data-selected') === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-testid')).toBe(`projection-part-${parts[1].id}`)
  })

  // The cull is the projector's, and the pane must show its result rather than re-deriving one.
  it('draws fewer parts in End than in Front, because End is a section', () => {
    draw('End')
    const end = screen.getAllByTestId(/^projection-part-/).length
    cleanup()
    draw('Front')
    expect(end).toBeLessThan(screen.getAllByTestId(/^projection-part-/).length)
  })

  // getAllByText, not getByText: an opening-chain label is free to equal an overall figure on some
  // future preset, and a duplicate should not turn this into a confusing failure about the wrong
  // thing. What is asserted is that the overall figures are labelled at all.
  it('labels the overall dimensions', () => {
    draw()
    expect(screen.getAllByText('600').length).toBeGreaterThan(0)
    expect(screen.getAllByText('720').length).toBeGreaterThan(0)
  })

  // A part that is not an axis-aligned box carries `outline` — its real silhouette — while `rects`
  // is only the bounding rectangle it is hit-tested by. Drawing `solid` for such a part puts a box
  // around a tilted dowel, which is what this catches. Mutation: render `solid` unconditionally.
  it('draws a non-axis-aligned part as its outline, not as a box', () => {
    const dowel = {
      kind: 'cylinder' as const,
      id: 'board_dowel',
      label: 'Dowel 1',
      diameter: 8,
      length: 40,
      material: '',
      color: '#ca8',
      position: { x: 100, y: 100, z: 100 },
      rotation: { x: 0, y: 30, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: cabinet.id,
      driven: false,
    }
    render(
      <CabinetProjection
        view="Front"
        parts={[dowel]}
        byId={byId}
        cabinet={cabinet}
        materials={PRESET_MATERIALS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )
    const g = screen.getByTestId('projection-part-board_dowel')
    expect(g.querySelectorAll('polygon')).toHaveLength(1)
    expect(g.querySelectorAll('line')).toHaveLength(0)
  })

  it('renders a message rather than throwing for a cabinet that does not build', () => {
    render(
      <CabinetProjection
        view="Front"
        parts={[]}
        byId={byId}
        cabinet={{ ...cabinet, params: { ...cabinet.params, width: 5 } }}
        materials={PRESET_MATERIALS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/do not build/i)).toBeTruthy()
    expect(screen.queryAllByTestId(/^projection-part-/)).toEqual([])
  })

  // `v.parts` is nearest first, so the pane paints it backwards: the nearest part is drawn LAST and
  // therefore takes the click where two overlap. An overlay door is the nearest thing in the Front
  // view of every preset — if it painted first the carcase would be drawn over the door and every
  // click on a door would select whatever is behind it. Mutation: drop the `.reverse()`.
  it('paints the nearest part last, so the door takes the click', () => {
    draw()
    const drawn = screen.getAllByTestId(/^projection-part-/)
    const door = parts.find((p) => p.role?.startsWith('front-'))!
    expect(drawn[drawn.length - 1].getAttribute('data-testid')).toBe(`projection-part-${door.id}`)
  })

  // Carcase z runs up and SVG y runs down. Getting that backwards draws an upside-down cabinet that
  // looks entirely plausible, so the claim is read off the rendered attributes of two parts that
  // cannot be confused: the bottom panel must end up BELOW the top panel on screen. Mutation:
  // `flip` returns `y`.
  it('draws the cabinet the right way up', () => {
    draw()
    const yOf = (role: string) =>
      Number(
        screen
          .getByTestId(`projection-part-${roleId(role)}`)
          .querySelector('rect')!
          .getAttribute('y'),
      )
    expect(yOf('bottom')).toBeGreaterThan(yOf('top'))
  })

  // Four families come off one AssemblyPart and the projector's own tests cannot see which of them
  // the pane forgot to draw. The near face of a side panel is visible; the far one is behind the
  // door, so the same part carries both kinds of edge.
  it('draws visible edges solid and occluded edges dashed', () => {
    draw()
    const side = screen.getByTestId(`projection-part-${roleId('left-side')}`)
    expect(side.querySelectorAll('line[stroke="#333"]').length).toBeGreaterThan(0)
    expect(side.querySelectorAll('line[stroke-dasharray]').length).toBeGreaterThan(0)
  })

  // The other two families. The toe-kick notch is internal in Front — there is still material behind
  // it — so it draws as a dashed rectangle; the pin rows are bored through the side's face, which
  // only the End view looks down.
  it('draws an internal cut as a dashed rectangle and a pin row as circles', () => {
    const cut = machined()
    drawParts('Front', cut)
    const side = screen.getByTestId(`projection-part-${roleId('left-side')}`)
    expect(side.querySelectorAll('rect[stroke-dasharray]').length).toBeGreaterThan(0)
    cleanup()
    drawParts('End', cut)
    const inEnd = screen.getByTestId(`projection-part-${roleId('left-side')}`)
    expect(inEnd.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  // The dimension ring is drawn OUTSIDE the cabinet, in the viewBox padding. Every view has to fit
  // in the same fixed padding, and End and Top are the ones nobody looks at — a ring that overflows
  // is simply clipped away with no error anywhere. Anchor points only: happy-dom lays out no text,
  // so how far a label runs from its anchor is not measurable here.
  it.each(['Front', 'Top', 'End'] as const)(
    'keeps the %s dimension ring inside the view',
    (view) => {
      drawParts(view, parts)
      const svg = screen.getByRole('img')
      const [x0, y0, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number)
      const inside = (x: number, y: number) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h
      const dims = [...svg.querySelectorAll('text')]
      expect(dims.length).toBeGreaterThan(0)
      for (const t of dims) {
        expect(inside(Number(t.getAttribute('x')), Number(t.getAttribute('y')))).toBe(true)
      }
      for (const l of svg.querySelectorAll('line[stroke="#666"]')) {
        expect(inside(Number(l.getAttribute('x1')), Number(l.getAttribute('y1')))).toBe(true)
        expect(inside(Number(l.getAttribute('x2')), Number(l.getAttribute('y2')))).toBe(true)
      }
    },
  )

  // Two dimensions on the same side of one view are told apart only by their ring, so ring 2 has to
  // sit further out than ring 1 or the two land on the same line. The Front view of a toe-kick
  // cabinet is where both appear on the same side: the toe-kick height on ring 2 and the opening
  // height on ring 1, both on the left, so further out is further negative.
  it('draws the outer dimension ring further out than the inner one', () => {
    draw()
    const xOf = (label: string) => Number(screen.getByText(label).getAttribute('x'))
    expect(xOf('100')).toBeLessThan(xOf('584'))
  })

  // Labels are sized as a fraction of the view's own extent, not in absolute millimetres: the
  // viewBox is fitted to the pane, so a fixed 3 mm label on a 720 mm cabinet renders at under two
  // pixels. Two cabinets, one half the size of the other, must not carry the same label size.
  it('sizes labels against the cabinet, not in absolute millimetres', () => {
    const sizeOf = (scale: number) => {
      const p = cabinet.params
      const small = { ...p, width: p.width * scale, height: p.height * scale }
      render(
        <CabinetProjection
          view="Front"
          parts={partsOfCarcase(small)}
          byId={new Map<ComponentId, Component>([[cabinet.id, { ...cabinet, params: small }]])}
          cabinet={{ ...cabinet, params: small }}
          materials={PRESET_MATERIALS}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      )
      const size = Number(screen.getByRole('img').querySelector('text')!.getAttribute('font-size'))
      cleanup()
      return size
    }
    expect(sizeOf(0.5)).toBeLessThan(sizeOf(1))
  })
})
