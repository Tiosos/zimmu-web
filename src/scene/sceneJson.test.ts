import { describe, expect, it, vi } from 'vitest'
import { sceneJson } from './sceneJson'
import type { Scene } from './types'

const emptyScene = (): Scene => ({
  parts: [],
  materials: {},
  hardware: [],
  joints: [],
  components: [],
})
const sceneWith = (extra: Partial<Scene>): Scene => ({ ...emptyScene(), ...extra })

describe('sceneJson', () => {
  it('matches JSON.stringify for arrays of objects, optional fields and nested undefined', () => {
    const scene = sceneWith({
      hardware: [
        { id: 'h1', name: 'Hinge', qty: 2, unit: 'ea', notes: undefined } as never,
        { id: 'h2', name: 'Pull', qty: 1, unit: 'ea' } as never,
      ],
      cabinetRules: undefined,
    })
    expect(sceneJson(scene)).toBe(JSON.stringify(scene))
  })

  it('matches for the empty scene', () => {
    const scene = emptyScene()
    expect(sceneJson(scene)).toBe(JSON.stringify(scene))
  })

  it('serialises an unchanged element once and a replaced one again', () => {
    const kept = { id: 'h1', name: 'Hinge', qty: 2, unit: 'ea' } as never
    const spy = vi.spyOn(JSON, 'stringify')
    const first = sceneWith({ hardware: [kept] })
    sceneJson(first)
    spy.mockClear()
    const second = sceneWith({ hardware: [kept, { id: 'h2' } as never] })
    sceneJson(second)
    const serialised = spy.mock.calls.map(([v]) => v)
    expect(serialised).not.toContain(kept)
    expect(serialised).toContainEqual({ id: 'h2' })
    spy.mockRestore()
  })

  it('reflects a replaced element', () => {
    const a = sceneWith({ hardware: [{ id: 'h1', qty: 1 } as never] })
    const b = sceneWith({ hardware: [{ id: 'h1', qty: 2 } as never] })
    expect(sceneJson(a)).not.toBe(sceneJson(b))
  })
})
