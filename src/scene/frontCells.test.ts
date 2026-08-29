import { describe, expect, it } from 'vitest'
import { frontCells, type FrontGeometry } from './frontCells'
import { resolveSections, type Rect, type Section } from './sectionTree'

// A 600 × 720 cabinet's clear opening on 18 mm stock, matching `openingRect` for the Base preset.
const OPENING: Rect = { x0: 18, x1: 582, z0: 118, z1: 702 }

// What the cabinet is, outside the opening: where an overlay front expands to.
const OUTER: Rect = { x0: 0, x1: 600, z0: 100, z1: 720 }

const leaf = (id: string, front?: Section['front']): Section => ({
  id,
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
  ...(front === undefined ? {} : { front }),
})

const geom = (over: Partial<FrontGeometry> = {}): FrontGeometry => ({
  outer: OUTER,
  mount: 'overlay',
  reveal: 3,
  ...over,
})

const cellsOf = (root: Section, g: FrontGeometry) =>
  frontCells(
    root,
    resolveSections(root, OPENING, () => 18),
    g,
  )

describe('frontCells', () => {
  it('lists nothing for a section with no front', () => {
    expect(cellsOf(leaf('a'), geom())).toEqual([])
  })

  // Overlay: the cell expands to the cabinet's outer edge, then every edge takes half a reveal, so
  // two cabinets side by side leave one reveal between their doors.
  it('expands a lone overlay front to the cabinet and insets half a reveal all round', () => {
    const [cell] = cellsOf(leaf('a', { kind: 'door', leaves: 1, hinge: 'left' }), geom())
    expect(cell.rect).toEqual({ x0: 1.5, x1: 598.5, z0: 101.5, z1: 718.5 })
  })

  // Inset: the cell is the opening itself, every edge a full reveal clear of the carcase.
  it('insets a lone inset front by a full reveal from the opening', () => {
    const [cell] = cellsOf(
      leaf('a', { kind: 'door', leaves: 1, hinge: 'left' }),
      geom({ mount: 'inset' }),
    )
    expect(cell.rect).toEqual({ x0: 21, x1: 579, z0: 121, z1: 699 })
  })

  const DIVIDED: Section = {
    id: 'root',
    size: { kind: 'equal' },
    content: {
      kind: 'split',
      axis: 'vertical',
      division: 'panel',
      children: [
        leaf('l', { kind: 'door', leaves: 1, hinge: 'left' }),
        leaf('r', { kind: 'door', leaves: 1, hinge: 'right' }),
      ],
    },
  }

  // Overlay: the two fronts cover the division between them and meet over its midline, so the gap
  // between them is one reveal — the division is not visible.
  it('leaves one reveal between two overlay fronts over a division', () => {
    const [left, right] = cellsOf(DIVIDED, geom())
    expect(right.rect.x0 - left.rect.x1).toBeCloseTo(3, 9)
  })

  // Inset: the division *is* visible between the two fronts, so the gap between them is the
  // division plus two reveals. The rule that holds is the spec's own — every inset front clears
  // surrounding material by exactly one reveal — so that is what is asserted. Asserting a
  // front-to-front gap of one reveal here would be asserting the wrong cabinet.
  it('clears the division by exactly one reveal on each side, inset', () => {
    const tree = resolveSections(DIVIDED, OPENING, () => 18)
    const [division] = tree.divisions
    const [left, right] = frontCells(DIVIDED, tree, geom({ mount: 'inset' }))
    expect(division.rect.x0 - left.rect.x1).toBeCloseTo(3, 9)
    expect(right.rect.x0 - division.rect.x1).toBeCloseTo(3, 9)
  })

  // A two-leaf door is one front on one section: the pair splits the cell with a reveal between
  // them, and each leaf is hinged on its own outer edge.
  it('splits a two-leaf door into a hinged pair with one reveal between', () => {
    const cells = cellsOf(leaf('a', { kind: 'door', leaves: 2, hinge: 'left' }), geom())
    expect(cells).toHaveLength(2)
    expect(cells[1].rect.x0 - cells[0].rect.x1).toBeCloseTo(3, 9)
    expect(cells.map((c) => c.hinge)).toEqual(['left', 'right'])
    expect(cells.map((c) => c.leaf)).toEqual([0, 1])
  })

  // A split with `division: 'none'` puts two fronts edge to edge with no material between. Each
  // must take half a reveal there, not a full one, or the gap comes out at two reveals.
  it('takes half a reveal where a front abuts another front with no division between', () => {
    const door = { kind: 'door', leaves: 1, hinge: 'left' } as const
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [leaf('l', door), leaf('r', door)],
      },
    }
    const [left, right] = cellsOf(root, geom({ mount: 'inset' }))
    expect(right.rect.x0 - left.rect.x1).toBeCloseTo(3, 9)
    // …and the outer edges still take a full reveal from the carcase.
    expect(left.rect.x0).toBeCloseTo(OPENING.x0 + 3, 9)
    expect(right.rect.x1).toBeCloseTo(OPENING.x1 - 3, 9)
  })

  it('carries the section id and the spec through', () => {
    const spec = { kind: 'drawer-front' } as const
    const [cell] = cellsOf(leaf('a', spec), geom())
    expect(cell.sectionId).toBe('a')
    expect(cell.spec).toEqual(spec)
  })

  // A split section holds no front of its own — its children do — matching `sectionInteriors`.
  it('never lists a split section', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'panel',
        children: [leaf('a'), leaf('b', { kind: 'panel' })],
      },
      front: { kind: 'door', leaves: 1, hinge: 'left' },
    }
    expect(cellsOf(root, geom()).map((c) => c.sectionId)).toEqual(['b'])
  })
})
