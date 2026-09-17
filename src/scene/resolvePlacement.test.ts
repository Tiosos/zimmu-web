import { describe, it, expect } from 'vitest'
import { resolvePlacement } from './resolvePlacement'
import type { Anchor, CarcaseComponent, ComponentId, MaterialDef, Scene } from './types'
import { newSectionId } from './sectionTree'

const MATERIALS: Record<string, MaterialDef> = {
  Ply18: { costPerM2: 40, thickness: 18 },
  Ply6: { costPerM2: 20, thickness: 6 },
  Oak20: { costPerM2: 90, thickness: 20 },
}

const cabinet = (
  id: string,
  over: Partial<CarcaseComponent> = {},
  width = 600,
  depth = 560,
): CarcaseComponent => ({
  kind: 'carcase',
  id: id as ComponentId,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: {
    width,
    height: 720,
    depth,
    carcaseMaterial: 'Ply18',
    backMaterial: 'Ply6',
    frontMaterial: 'Oak20',
    hasTop: true,
    backMode: 'captured',
    baseMode: 'none',
    toeKickHeight: 100,
    toeKickSetback: 50,
    frontMount: 'overlay',
    frontReveal: 3,
    section: { id: newSectionId(), size: { kind: 'equal' }, content: { kind: 'leaf' } },
    jointMethod: 'butt-screw',
  },
  ...over,
})

const anchorTo = (to: string, over: Partial<Anchor> = {}): Anchor => ({
  to: to as ComponentId,
  face: 'right',
  gap: 0,
  offset: { u: 0, v: 0 },
  ...over,
})

const scene = (components: CarcaseComponent[]): Scene => ({
  parts: [],
  materials: MATERIALS,
  hardware: [],
  joints: [],
  components,
})

const at = (s: Scene, id: string) =>
  s.components.find((c) => c.id === id) as CarcaseComponent | undefined

describe('resolvePlacement', () => {
  it('leaves a free-placed cabinet exactly where it is', () => {
    const a = cabinet('a', { position: { x: 123, y: -45, z: 6 } })
    const out = resolvePlacement(scene([a]))
    expect(at(out, 'a')?.position).toEqual({ x: 123, y: -45, z: 6 })
  })

  it('returns the same component objects when nothing moves', () => {
    const a = cabinet('a')
    const out = resolvePlacement(scene([a]))
    expect(at(out, 'a')).toBe(a)
  })

  it('places an anchored cabinet against its target', () => {
    const a = cabinet('a')
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position).toEqual({ x: 600, y: 0, z: 0 })
  })

  it('follows a chain of three, each against the last', () => {
    const a = cabinet('a', {}, 600)
    const b = cabinet('b', { anchor: anchorTo('a') }, 400)
    const c = cabinet('c', { anchor: anchorTo('b') }, 800)
    const out = resolvePlacement(scene([a, b, c]))
    expect(at(out, 'b')?.position.x).toBe(600)
    expect(at(out, 'c')?.position.x).toBe(1000)
  })

  // The mutation guard: a fixture that stores the chain in order survives resolving in array order.
  // This one stores the dependants FIRST, so only a topological walk gets it right.
  it('resolves a chain stored back to front', () => {
    const c = cabinet('c', { anchor: anchorTo('b') }, 800)
    const b = cabinet('b', { anchor: anchorTo('a') }, 400)
    const a = cabinet('a', {}, 600)
    const out = resolvePlacement(scene([c, b, a]))
    expect(at(out, 'b')?.position.x).toBe(600)
    expect(at(out, 'c')?.position.x).toBe(1000)
  })

  it('moves the dependant when the target grows', () => {
    const a = cabinet('a', {}, 900)
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position.x).toBe(900)
  })

  it('detaches an anchor naming a component that does not exist, leaving it in place', () => {
    const b = cabinet('b', { position: { x: 777, y: 0, z: 0 }, anchor: anchorTo('ghost') })
    const out = resolvePlacement(scene([b]))
    expect(at(out, 'b')?.anchor).toBeUndefined()
    expect(at(out, 'b')?.position).toEqual({ x: 777, y: 0, z: 0 })
  })

  it('detaches an anchor to itself', () => {
    const a = cabinet('a', { position: { x: 50, y: 0, z: 0 }, anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a]))
    expect(at(out, 'a')?.anchor).toBeUndefined()
    expect(at(out, 'a')?.position).toEqual({ x: 50, y: 0, z: 0 })
  })

  it('breaks a two-cabinet cycle rather than looping forever', () => {
    const a = cabinet('a', { anchor: anchorTo('b') })
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'a')?.anchor).toBeUndefined()
    expect(at(out, 'b')?.anchor).toBeUndefined()
  })

  it('detaches an anchor across a different parent', () => {
    const a = cabinet('a')
    const b = cabinet('b', { parentId: 'cmp_group' as ComponentId, anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.anchor).toBeUndefined()
  })

  it('is idempotent — running it twice changes nothing more', () => {
    const a = cabinet('a')
    const b = cabinet('b', { anchor: anchorTo('a') })
    const once = resolvePlacement(scene([a, b]))
    const twice = resolvePlacement(once)
    expect(twice.components).toEqual(once.components)
  })

  // The corner, end to end through the pass.
  it('places a turned return run against a blind unit front', () => {
    const blind = cabinet('blind', {}, 900)
    const ret = cabinet(
      'ret',
      { rotation: { x: 0, y: 0, z: 90 }, anchor: anchorTo('blind', { face: 'front' }) },
      600,
    )
    const out = resolvePlacement(scene([blind, ret]))
    expect(at(out, 'ret')?.position.x).toBeCloseTo(560)
    expect(at(out, 'ret')?.position.y).toBeCloseTo(-600)
  })

  // A `front`-face anchor moves the cabinet along y while x — the axis the other tests all move
  // on — stays exactly where it started. If "did anything move" only asked about x, this case
  // would look unchanged and the freshly computed y would be thrown away.
  it('moves a cabinet on y alone when the anchor axis is not x', () => {
    const a = cabinet('a')
    const b = cabinet('b', { anchor: anchorTo('a', { face: 'front' }) })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position).toEqual({ x: 0, y: -560, z: 0 })
  })

  it('a toe kick under the target does not lift the neighbour off the floor', () => {
    const a = cabinet('a')
    a.params.baseMode = 'toe-kick'
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position.z).toBe(0)
  })
})
