import { describe, expect, it, vi } from 'vitest'

vi.mock('comlink', () => ({
  wrap: () => ({}),
  expose: vi.fn(),
  transfer: vi.fn((data) => data),
}))
vi.stubGlobal('Worker', vi.fn(function MockWorker() {}))

import { applyPipeline } from './useScene'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { setFrontOn } from './sectionInterior'
import type { BoardPart, CarcaseParams, ComponentId, EdgeDecisions, Part, Scene } from './types'

const BAND = 'ABS 1mm'
const DECISION: EdgeDecisions = { x0: null, y1: BAND }

const sceneWith = (params: CarcaseParams): Scene => ({
  parts: [],
  materials: { ...PRESET_MATERIALS, [BAND]: { thickness: 1, use: 'edge' } },
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

const base = CARCASE_PRESETS[0].params
const withParams = (scene: Scene, patch: Partial<CarcaseParams>): Scene => ({
  ...scene,
  components: scene.components.map((c) =>
    c.kind === 'carcase' ? { ...c, params: { ...c.params, ...patch } } : c,
  ),
})
const decide = (scene: Scene, match: (p: BoardPart) => boolean): Scene => ({
  ...scene,
  parts: scene.parts.map((p) =>
    p.kind === 'board' && match(p) ? { ...p, edgeBanding: DECISION } : p,
  ),
})
const find = (scene: Scene, match: (p: BoardPart) => boolean): Part | undefined =>
  scene.parts.find((p) => p.kind === 'board' && match(p))

describe('an edge decision on a generated board survives regeneration', () => {
  const carcase = (): Scene => applyPipeline(sceneWith({ ...base, edgeMaterial: BAND }))
  const isLeft = (p: BoardPart) => p.role === 'left-side'

  it('on a carcase panel, through a pipeline run and a width change', () => {
    const decided = decide(carcase(), isLeft)
    const again = applyPipeline(decided)
    expect((find(again, isLeft) as BoardPart).edgeBanding).toEqual(DECISION)
    const wider = applyPipeline(withParams(again, { width: base.width + 100 }))
    expect((find(wider, isLeft) as BoardPart).edgeBanding).toEqual(DECISION)
  })

  it('on a drawer box board', () => {
    const scene = applyPipeline(
      sceneWith({
        ...base,
        edgeMaterial: BAND,
        section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' }),
      }),
    )
    const drawer = scene.components.find((c) => c.kind === 'drawer')!
    const isBox = (p: BoardPart) => p.parentId === drawer.id && p.role?.startsWith('box-') === true
    const decided = decide(scene, isBox)
    expect(decided.parts.some((p) => p.kind === 'board' && isBox(p) && p.edgeBanding)).toBe(true)
    const after = applyPipeline(decided)
    const boards = after.parts.filter((p): p is BoardPart => p.kind === 'board' && isBox(p))
    expect(boards.length).toBeGreaterThan(0)
    for (const b of boards) expect(b.edgeBanding).toEqual(DECISION)
  })

  it('on a face frame stile', () => {
    const scene = applyPipeline(
      sceneWith({
        ...base,
        edgeMaterial: BAND,
        frame: { stileWidth: 44, railWidth: 32, midStileWidth: 56, midRailWidth: 38 },
      }),
    )
    const isStile = (p: BoardPart) => p.role === 'stile-left'
    const after = applyPipeline(decide(scene, isStile))
    expect((find(after, isStile) as BoardPart).edgeBanding).toEqual(DECISION)
  })

  it('on a detached board', () => {
    const scene = carcase()
    const detached: Scene = {
      ...scene,
      parts: scene.parts.map((p) =>
        p.kind === 'board' && isLeft(p) ? { ...p, driven: false, edgeBanding: DECISION } : p,
      ),
    }
    const after = applyPipeline(withParams(detached, { width: base.width + 100 }))
    expect(find(after, (p) => p.edgeBanding !== undefined && !p.driven)).toBeDefined()
  })
})
