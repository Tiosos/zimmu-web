import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetProjection } from './CabinetProjection'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { carcaseCuts, carcaseHoleArrays } from '../scene/carcaseRoles'
import { roleThicknessFor } from '../scene/resolveThickness'
import { jointKindFor } from '../scene/resolveJointKind'
import { buildAssemblyViews } from '../geom/assembly'
import { componentsById } from '../scene/componentTree'
import { setFrontOn } from '../scene/sectionInterior'
import { regenerateDrawers } from '../scene/regenerateDrawers'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { CarcaseComponent, Component, ComponentId, Part } from '../scene/types'
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

  // The bug this exists for: `PADDING` was a flat 60 mm while the font scaled with the cabinet, so
  // a Tall 600's "2100" ran ~71 mm past the viewBox and SVG clipped it in silence. Anchor points
  // alone cannot see that — the anchor was always inside; it was the GLYPHS that overflowed.
  //
  // The width model here is deliberately more pessimistic than the component's (0.6 per character
  // against its 0.55), so this asserts the padding has real slack rather than mirroring the
  // component's own arithmetic back at it. `fontSize` and `text-anchor` are read off the rendered
  // element, never assumed.
  const labelExtent = (t: Element) => {
    const x = Number(t.getAttribute('font-size') === null ? NaN : t.getAttribute('x'))
    const size = Number(t.getAttribute('font-size'))
    const w = (t.textContent ?? '').length * 0.6 * size
    const anchor = t.getAttribute('text-anchor')
    if (anchor === 'end')
      return {
        lo: x - w,
        hi: x,
        top: Number(t.getAttribute('y')) - size,
        bottom: Number(t.getAttribute('y')),
      }
    if (anchor === 'middle')
      return {
        lo: x - w / 2,
        hi: x + w / 2,
        top: Number(t.getAttribute('y')) - size,
        bottom: Number(t.getAttribute('y')),
      }
    return {
      lo: x,
      hi: x + w,
      top: Number(t.getAttribute('y')) - size,
      bottom: Number(t.getAttribute('y')),
    }
  }

  it.each(
    CARCASE_PRESETS.flatMap((preset) =>
      (['Front', 'Top', 'End'] as const).map((view) => [preset.name, view, preset.params] as const),
    ),
  )('keeps every %s %s label wholly inside the viewBox', (_label, view, params) => {
    const c = { ...cabinet, params }
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    render(
      <CabinetProjection
        view={view}
        parts={partsOfCarcase(params)}
        byId={ids}
        cabinet={c}
        materials={PRESET_MATERIALS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )
    const svg = screen.getByRole('img')
    const [x0, y0, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const texts = [...svg.querySelectorAll('text')]
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) {
      const e = labelExtent(t)
      expect(e.lo).toBeGreaterThanOrEqual(x0)
      expect(e.hi).toBeLessThanOrEqual(x0 + w)
      expect(e.top).toBeGreaterThanOrEqual(y0)
      expect(e.bottom).toBeLessThanOrEqual(y0 + h)
    }
  })

  // Containment cannot see this one: the padding derives from the font, so a font twice as large
  // simply buys twice the margin and every label still fits. What goes wrong is legibility — a
  // 600 x 2100 cabinet sized off its LARGER extent gets a 47 mm label against a 600 mm width, an
  // annotation that dwarfs the thing it annotates. The rule is that a label stays small against the
  // view's NARROWER side, and the bound here is looser than the component's divisor so this is a
  // real constraint with slack rather than the constant read back.
  it.each(
    CARCASE_PRESETS.flatMap((preset) =>
      (['Front', 'Top', 'End'] as const).map((view) => [preset.name, view, preset.params] as const),
    ),
  )('keeps %s %s labels small against the narrower side of the view', (_name, view, params) => {
    const c = { ...cabinet, params }
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    render(
      <CabinetProjection
        view={view}
        parts={partsOfCarcase(params)}
        byId={ids}
        cabinet={c}
        materials={PRESET_MATERIALS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )
    const svg = screen.getByRole('img')
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const texts = [...svg.querySelectorAll('text')]
    expect(texts.length).toBeGreaterThan(0)
    // The viewBox is the view plus its own padding on both sides, so the drawn extent is recovered
    // rather than recomputed from the params — this reads what was rendered.
    const padding = -Number(svg.getAttribute('viewBox')!.split(' ')[0])
    const narrower = Math.min(w - padding * 2, h - padding * 2)
    for (const t of texts) {
      expect(Number(t.getAttribute('font-size'))).toBeLessThanOrEqual(narrower / 25)
    }
  })

  // The padding is read off the labels the view actually carries, not off a guess at the longest one
  // a cabinet might produce. Both cabinets share a 600 mm smaller extent, so both get the same font;
  // only the label length differs. A hardcoded character count passes the test above and fails here.
  it('widens the padding for a longer label at the same font size', () => {
    const paddingOf = (height: number) => {
      const c = { ...cabinet, params: { ...cabinet.params, width: 600, height } }
      const ids = new Map<ComponentId, Component>([[c.id, c]])
      render(
        <CabinetProjection
          view="Front"
          parts={partsOfCarcase(c.params)}
          byId={ids}
          cabinet={c}
          materials={PRESET_MATERIALS}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      )
      const x0 = Number(screen.getByRole('img').getAttribute('viewBox')!.split(' ')[0])
      cleanup()
      return -x0
    }
    // "700" is three characters; "1700" is four. Same 600 mm width, so the same font either way.
    expect(paddingOf(1700)).toBeGreaterThan(paddingOf(700))
  })

  // A side label reads outward from its own ring. Anchoring both sides 'start' ran the left-hand
  // labels back across the drawing they annotate — which overflows nothing and so is invisible to
  // the containment test above.
  it('anchors each side label away from the drawing', () => {
    draw()
    const anchorOf = (label: string) => screen.getByText(label).getAttribute('text-anchor')
    expect(anchorOf('720')).toBe('start') // overall height, on the right
    expect(anchorOf('100')).toBe('end') // toe-kick height, on the left
  })

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

// descendantIds is recursive, so a drawer's boards reach the projections without anyone adding
// them. Wanted in Top and End, which are sections through the cabinet, and hidden in Front where
// the applied front covers the box.
//
// Both counts are computed here from the same scene, so this stays true if a preset changes. An
// assertion against a number copied out of a baseline run would pin the preset, not the rule.
//
// `AssemblyPart` carries no `visible` field: a part draws a visible edge when its `solid` segment
// list is non-empty, so "carrying a visible edge" is `p.solid.length > 0`.
describe('CabinetProjection — the drawer box in the views', () => {
  const build = () => {
    const base = CARCASE_PRESETS[0].params
    const params = {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' as const }),
    }
    const cabinet: CarcaseComponent = {
      kind: 'carcase',
      id: 'cmp_1' as ComponentId,
      label: 'Base A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    }
    const full = regenerateComponents(
      regenerateDrawers({
        parts: [],
        materials: { ...PRESET_MATERIALS },
        hardware: [],
        joints: [],
        components: [cabinet],
      }),
    )
    const byId = componentsById(full.components)
    const drawerIds = new Set(full.components.filter((c) => c.kind === 'drawer').map((c) => c.id))
    const carcaseOnly = full.parts.filter((p) => !drawerIds.has(p.parentId ?? ('' as ComponentId)))
    const drawn = (parts: typeof full.parts) =>
      buildAssemblyViews(parts, byId, cabinet, full.materials).map(
        (v) => v.parts.filter((p) => p.solid.length > 0).length,
      )
    return { without: drawn(carcaseOnly), with: drawn(full.parts) }
  }

  it('adds the box to the section views', () => {
    const { without, with: withBoxes } = build()
    // Views are [Front, Top, End]. Top and End cut through the cabinet, so they gain the box.
    expect(withBoxes[1]).toBeGreaterThan(without[1])
    expect(withBoxes[2]).toBeGreaterThan(without[2])
  })

  it('leaves the elevation alone, because the front covers the box', () => {
    const { without, with: withBoxes } = build()
    expect(withBoxes[0]).toBe(without[0])
  })

  // The fixture must actually contain a box, or both tests above pass for the wrong reason.
  it('is testing a cabinet that really has one', () => {
    const base = CARCASE_PRESETS[0].params
    const params = {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' as const }),
    }
    const full = regenerateDrawers({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [
        {
          kind: 'carcase',
          id: 'cmp_1' as ComponentId,
          label: 'Base A',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          params,
        },
      ],
    })
    expect(full.components.some((c) => c.kind === 'drawer')).toBe(true)
    expect(full.parts.filter((p) => p.role?.startsWith('box-'))).toHaveLength(5)
  })
})
