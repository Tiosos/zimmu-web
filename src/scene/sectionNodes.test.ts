import { describe, it, expect } from 'vitest'
import { sectionNodes } from './sectionNodes'
import type { SectionOpening } from './sectionInterior'
import type { BoardPart, Part } from './types'

// Only `sectionId` is read. The rest of SectionOpening is carried for other callers, so a fixture
// that filled it in would be asserting against fields this module never looks at.
const opening = (sectionId: string): SectionOpening =>
  ({ sectionId, rect: { x0: 0, x1: 0, z0: 0, z1: 0 }, spec: undefined }) as unknown as SectionOpening

// REAL section ids, uuid-shaped and full of hyphens. A fixture using `sec_a` cannot fail: every
// plausible way of getting the parse wrong still works on an id with no hyphen in it — the same
// trap `panelThickness.test.ts` exists for on the thickness side.
const A = 'sec_e463c3bd-a90f-4009-80b5-303930147885'
const B = 'sec_86d09407-69cb-45a0-b804-16e0c969cd46'

const part = (over: Partial<BoardPart> = {}): Part => ({
  kind: 'board',
  id: 'board_1',
  label: 'Part',
  length: 100,
  width: 100,
  thickness: 18,
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
  ...over,
})

describe('sectionNodes', () => {
  it('returns one node per opening, in the order it was handed them', () => {
    const { sections } = sectionNodes([opening(A), opening(B)], [])
    expect(sections.map((s) => s.sectionId)).toEqual([A, B])
  })

  it('puts a front, an adjustable shelf and a fixed shelf on their own opening', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A), opening(B)],
      [
        part({ id: 'board_1', role: `front-${A}-0` }),
        part({ id: 'board_2', role: `front-${A}-1` }),
        part({ id: 'board_3', role: `adj-shelf-${B}-0` }),
        part({ id: 'board_4', role: `fixed-shelf-${B}-2` }),
      ],
    )
    expect(sections[0].parts.map((p) => p.id)).toEqual(['board_1', 'board_2'])
    expect(sections[1].parts.map((p) => p.id)).toEqual(['board_3', 'board_4'])
    expect(carcase).toEqual([])
  })

  // The finding this module turns on. `division-{parentId}-{index}` names the section that was
  // SPLIT, which is by definition an internal node — never a leaf, so never an opening. A divider
  // sits between openings, not in one, which is correct woodworking as well as correct code.
  it('puts a divider in the carcase, never in the opening whose id it names', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A)],
      [part({ id: 'board_9', role: `division-${A}-0` })],
    )
    expect(sections[0].parts).toEqual([])
    expect(carcase.map((p) => p.id)).toEqual(['board_9'])
  })

  it('puts the shell and an unroled part in the carcase', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A)],
      [
        part({ id: 'board_1', role: 'left-side' }),
        part({ id: 'board_2', role: 'toe-kick' }),
        part({ id: 'board_3', role: undefined, driven: false }),
      ],
    )
    expect(sections[0].parts).toEqual([])
    expect(carcase.map((p) => p.id)).toEqual(['board_1', 'board_2', 'board_3'])
  })

  // A section id from a cabinet that has since been rebuilt names nothing here. The tree is rebuilt
  // with fresh ids whenever the v12 divider shim runs, so this is ordinary input, not an error.
  it('puts a part naming an unknown opening in the carcase rather than throwing', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A)],
      [part({ id: 'board_1', role: `front-${B}-0` })],
    )
    expect(sections[0].parts).toEqual([])
    expect(carcase.map((p) => p.id)).toEqual(['board_1'])
  })

  it('returns every part as carcase when there are no openings', () => {
    const { sections, carcase } = sectionNodes([], [part({ role: `front-${A}-0` })])
    expect(sections).toEqual([])
    expect(carcase).toHaveLength(1)
  })
})
