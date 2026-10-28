import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHAKER,
  MIN_SHAKER_FRAME,
  FRONT_PIECES,
  pieceRole,
  shakerIssues,
  shakerPieces,
} from './frontStyle'
import { grainAxisOf } from './grain'
import { buildJointChecklist } from './jointChecklist'
import { sectionNodes } from './sectionNodes'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { carcaseMachining } from './carcaseMachining'
import { roleThicknessFor } from './resolveThickness'
import { jointKindFor } from './resolveJointKind'
import { CUP_EDGE_DISTANCE } from './frontMachining'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import type { SectionOpening } from './sectionInterior'
import type { CarcaseComponent, CarcaseParams, Part, Scene, ZimmuFile } from './types'
import type { Section } from './sectionTree'

const OUTER = { x0: 3, x1: 597, z0: 0, z1: 720 }
const FRAME = 60

const freshScene = (params: CarcaseParams): Scene => ({
  parts: [],
  materials: { ...PRESET_MATERIALS },
  hardware: [],
  joints: [],
  components: [
    {
      kind: 'carcase',
      id: 'cmp_1',
      label: 'Shaker test',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    },
  ],
})

const baseParams = (): CarcaseParams => CARCASE_PRESETS[0].params

const withStyle = (params: CarcaseParams, style: Section['front']): CarcaseParams => ({
  ...params,
  section: { ...params.section, front: style },
})

const frontParts = (params: CarcaseParams) => {
  const scene = regenerateComponents(freshScene(params))
  return scene.parts.filter((p) => p.role?.startsWith('front-'))
}

describe('shakerPieces', () => {
  it('makes five boards whose frame takes the outer rectangle and whose panel sits inside it', () => {
    const pieces = shakerPieces(OUTER, DEFAULT_SHAKER, -18, 0)

    expect(pieces.map((p) => p.piece)).toEqual([...FRONT_PIECES])
    const byPiece = new Map(pieces.map((p) => [p.piece, p]))

    // The stiles run the full height at the two outer edges; the rails sit between them.
    expect(byPiece.get('stile-l')!.rect).toEqual({ ...OUTER, x1: OUTER.x0 + FRAME })
    expect(byPiece.get('stile-r')!.rect).toEqual({ ...OUTER, x0: OUTER.x1 - FRAME })
    expect(byPiece.get('rail-b')!.rect).toMatchObject({ x0: OUTER.x0 + FRAME, z1: OUTER.z0 + FRAME })
    expect(byPiece.get('rail-t')!.rect).toMatchObject({ x1: OUTER.x1 - FRAME, z0: OUTER.z1 - FRAME })

    // The frame is the front's full depth; the panel is set back from the outer face (y0) and is
    // its own thickness, so it never leaves the door's envelope.
    for (const piece of ['stile-l', 'stile-r', 'rail-t', 'rail-b'] as const) {
      expect(byPiece.get(piece)!.y0).toBe(-18)
      expect(byPiece.get(piece)!.y1).toBe(0)
    }
    const panel = byPiece.get('panel')!
    expect(panel.y0).toBe(-18 + DEFAULT_SHAKER.panelRecess)
    expect(panel.y1 - panel.y0).toBe(DEFAULT_SHAKER.panelThickness)
    expect(panel.y1).toBeLessThanOrEqual(0)
    // The panel fills the opening the frame leaves, so the five boards leave no gap between them.
    expect(panel.rect).toEqual({
      x0: OUTER.x0 + FRAME,
      x1: OUTER.x1 - FRAME,
      z0: OUTER.z0 + FRAME,
      z1: OUTER.z1 - FRAME,
    })
  })
})

describe('shakerIssues', () => {
  const ok = DEFAULT_SHAKER

  it('accepts the default on an ordinary door', () => {
    expect(shakerIssues(ok, 600, 720, 18)).toEqual([])
  })

  it('refuses a frame the hinge cup cannot be bored into', () => {
    const issues = shakerIssues({ ...ok, frameWidth: MIN_SHAKER_FRAME - 1 }, 600, 720, 18)
    expect(issues.join(' ')).toMatch(/hinge cup/)
  })

  it('refuses a frame that leaves no panel across or down the front', () => {
    expect(shakerIssues(ok, 119, 720, 18).join(' ')).toMatch(/across/)
    expect(shakerIssues(ok, 600, 120, 18).join(' ')).toMatch(/down/)
  })

  it('refuses a panel that does not fit inside the front material', () => {
    expect(shakerIssues(ok, 600, 720, 10).join(' ')).toMatch(/does not fit inside/)
  })

  it('refuses nonsense figures rather than clamping them', () => {
    expect(shakerIssues({ ...ok, frameWidth: 0 }, 600, 720, 18).join(' ')).toMatch(
      /greater than zero/,
    )
    expect(shakerIssues({ ...ok, panelThickness: 0 }, 600, 720, 18).join(' ')).toMatch(
      /greater than zero/,
    )
    expect(shakerIssues({ ...ok, panelRecess: -1 }, 600, 720, 18).join(' ')).toMatch(/zero or more/)
  })
})

describe('registering a made front on a cabinet', () => {
  it('turns one door into five boards, and leaves nothing of the flat one', () => {
    const slab = frontParts(withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left' }))
    expect(slab).toHaveLength(1)

    const shaker = frontParts(
      withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left', style: DEFAULT_SHAKER }),
    )
    expect(shaker).toHaveLength(5)
    // The base door's own role is gone: a door is either one board or five, never both.
    expect(shaker.some((p) => p.role === slab[0].role)).toBe(false)
    expect(shaker.map((p) => p.role!.replace(`${slab[0].role!}-`, '')).sort()).toEqual(
      [...FRONT_PIECES].sort(),
    )
  })

  it('keeps the door’s visible extent identical to the flat one', () => {
    const slab = frontParts(withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left' }))
    const shaker = frontParts(
      withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left', style: DEFAULT_SHAKER }),
    )
    // Board width is the door's width for a front (thickness on y), and position is the box minimum,
    // so the outer edges are the reveals `frontCells` already took.
    const extent = (parts: typeof shaker) => {
      const spans = parts.map((p) => {
        if (p.kind !== 'board') throw new Error('a front is a board')
        return [p.position.x, p.position.x + p.width]
      })
      return [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))]
    }
    expect(extent(shaker)).toEqual(extent(slab))
    // The frame is the front material, so the door's outer face is still where the flat door's was.
    const s = slab[0]
    const stile = shaker.find((p) => p.role!.endsWith('-stile-l'))!
    const panel = shaker.find((p) => p.role!.endsWith('-panel'))!
    if (s.kind !== 'board' || stile.kind !== 'board' || panel.kind !== 'board') {
      throw new Error('a front is a board')
    }
    expect(stile.position.y).toBe(s.position.y)
    expect(stile.thickness).toBe(s.thickness)
    // The panel is the only board that is thinner.
    expect(panel.thickness).toBe(DEFAULT_SHAKER.panelThickness)
  })

  it('falls back to a flat door rather than emit a half-built assembly', () => {
    const parts = frontParts(
      withStyle(baseParams(), {
        kind: 'door',
        leaves: 1,
        hinge: 'left',
        style: { kind: 'shaker', frameWidth: MIN_SHAKER_FRAME - 1, panelRecess: 6, panelThickness: 6 },
      }),
    )
    expect(parts).toHaveLength(1)
  })
})

describe('ownership and grain of a made front', () => {
  it('files every piece of a door under its own opening', () => {
    const sectionId = 'sec_made'
    const section: Section = { id: sectionId, size: { kind: 'equal' }, content: { kind: 'leaf' } }
    const openings: SectionOpening[] = [{ sectionId, rect: OUTER, spec: undefined, section }]
    const parts = FRONT_PIECES.map((piece) => ({
      id: `board_${piece}`,
      kind: 'board' as const,
      role: pieceRole(`front-${sectionId}-0`, piece),
    }))
    const { sections, carcase } = sectionNodes(openings, parts as unknown as Part[])
    expect(carcase).toEqual([])
    expect(sections[0].parts).toHaveLength(5)
  })

  it('runs a rail’s grain across the door and a stile’s up it', () => {
    expect(grainAxisOf('front-sec_1-0-rail-t')).toBe('x')
    expect(grainAxisOf('front-sec_1-0-rail-b')).toBe('x')
    expect(grainAxisOf('front-sec_1-0-stile-l')).toBe('z')
    expect(grainAxisOf('front-sec_1-0-panel')).toBe('z')
  })
})

// The cup is bored into the door, and a made door has no single board to bore: it is bored into the
// stile it is hung on. Left-hinged means the left stile, whose own board frame still runs the door's
// height along board x — so the row needs no new arithmetic, only the right panel.
describe('a made front bores its cups into the stile it hangs on', () => {
  const machiningOf = (role: string) => {
    const styled = withStyle(baseParams(), {
      kind: 'door',
      leaves: 1,
      hinge: 'left',
      style: DEFAULT_SHAKER,
    })
    const thicknessOf = roleThicknessFor(styled, PRESET_MATERIALS, new Map())
    return carcaseMachining(styled, thicknessOf, jointKindFor([], 'cmp_1'), role, () => null)
  }

  it('bores the hinge cup into the hinge stile, not into a door board that no longer exists', () => {
    const section = baseParams().section
    const left = machiningOf(`front-${section.id}-0-stile-l`)
    expect(left.some((c) => c.id.startsWith('cups_'))).toBe(true)
    const cup = left.find((c) => c.id.startsWith('cups_'))!
    // Board y 0 is the door's outer edge, so a left hinge bores one edge distance in from it.
    expect(cup.start.y).toBe(CUP_EDGE_DISTANCE)
    // The handle-side stile is not bored.
    expect(machiningOf(`front-${section.id}-0-stile-r`).some((c) => c.id.startsWith('cups_'))).toBe(
      false,
    )
  })

  it('leaves the flat door’s own role unbuilt, so the base role answers nothing', () => {
    const section = baseParams().section
    expect(machiningOf(`front-${section.id}-0`)).toEqual([])
  })
})

// A style is an optional field, so an older file is a file that lacks it — the same rule every
// post-v20 feature follows. Version 43 is what makes the sequence legible in `fileFormatHistory`.
describe('a staged style survives the file', () => {
  const fileOf = (scene: Scene, version: number): ZimmuFile => ({
    version,
    name: 'Front styles',
    units: 'mm',
    appVersion: '0.0.0',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    camera: { position: { x: 0, y: 100, z: 100 }, target: { x: 0, y: 0, z: 0 } },
    scene,
  })

  it('round-trips a shaker door at the current format version', () => {
    const scene = regenerateComponents(
      freshScene(
        withStyle(baseParams(), {
          kind: 'door',
          leaves: 2,
          hinge: 'left',
          style: DEFAULT_SHAKER,
        }),
      ),
    )
    const parsed = parseFile(JSON.stringify(fileOf(scene, FILE_FORMAT_VERSION)))
    const cabinet = parsed.scene.components[0] as CarcaseComponent
    expect(cabinet.params.section.front).toMatchObject({
      kind: 'door',
      leaves: 2,
      style: DEFAULT_SHAKER,
    })
  })

  it('reads a file written before the field existed as a flat slab', () => {
    const scene = regenerateComponents(
      freshScene(withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left' })),
    )
    const parsed = parseFile(JSON.stringify(fileOf(scene, 42)))
    const cabinet = parsed.scene.components[0] as CarcaseComponent
    const front = cabinet.params.section.front
    expect(front?.kind).toBe('door')
    expect(front).not.toHaveProperty('style')
  })
})
describe('a made front is one front to the checklist', () => {
  const checklistOf = (params: CarcaseParams) => {
    const scene = regenerateComponents(freshScene(params))
    const byId = new Map(scene.components.map((c) => [c.id, c]))
    return buildJointChecklist(scene.parts, scene.joints, [], byId, scene.materials)
  }

  it('adds no unjoined rows when the door is made in pieces', () => {
    const slab = checklistOf(withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left' }))
    const shaker = checklistOf(
      withStyle(baseParams(), { kind: 'door', leaves: 1, hinge: 'left', style: DEFAULT_SHAKER }),
    )
    expect(shaker.rows.map((r) => r.key)).toEqual(slab.rows.map((r) => r.key))
  })

  it('declares every touching pair inside one door', () => {
    const params = withStyle(baseParams(), {
      kind: 'door',
      leaves: 1,
      hinge: 'left',
      style: DEFAULT_SHAKER,
    })
    const scene = regenerateComponents(freshScene(params))
    const roleOf = (piece: string) => scene.parts.find((p) => p.role?.endsWith(`-${piece}`))!
    const pieces = FRONT_PIECES.map((piece) => roleOf(piece))
    expect(pieces.every((p) => p !== undefined)).toBe(true)
    const byId = new Map(scene.components.map((c) => [c.id, c]))
    const { contact } = buildJointChecklist(scene.parts, scene.joints, [], byId, scene.materials)
    const declared = new Set(contact.map((r) => r.key))
    const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
    // Two stiles touch only the rails and the panel; two rails only the stiles and the panel. The
    // panel touches all four. Opposite pieces never meet, which is why this is not five choose two.
    const touching: [string, string][] = [
      ['stile-l', 'rail-b'],
      ['stile-l', 'rail-t'],
      ['stile-r', 'rail-b'],
      ['stile-r', 'rail-t'],
      ['panel', 'stile-l'],
      ['panel', 'stile-r'],
      ['panel', 'rail-b'],
      ['panel', 'rail-t'],
    ]
    for (const [a, b] of touching) {
      expect(declared.has(key(roleOf(a).id, roleOf(b).id))).toBe(true)
    }
  })
})
