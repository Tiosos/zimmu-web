import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanView } from './PlanView'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { resolvePlacement } from '../scene/resolvePlacement'
import type { Anchor, CarcaseComponent, Component, Scene } from '../scene/types'

const cab = (id: string, width: number, depth: number, anchor?: Anchor): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...CARCASE_PRESETS[0].params, width, depth },
  ...(anchor === undefined ? {} : { anchor }),
})

const sceneOf = (components: Component[]): Scene =>
  resolvePlacement({
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components,
  })

// Deliberately lopsided: a 450 beside a 600 is what makes an upside-down or mirrored plan visible.
const twoInARun = () =>
  sceneOf([
    cab('cmp_a', 600, 560),
    cab('cmp_b', 450, 500, { to: 'cmp_a', face: 'right', gap: 0, offset: { u: 0, v: 0 } }),
  ])

const draw = (scene: Scene, selected: string | null = null, onSelect = vi.fn(), onDrop = vi.fn()) => {
  render(<PlanView scene={scene} selectedId={selected} onSelect={onSelect} onDrop={onDrop} />)
  return { onSelect, onDrop }
}

describe('PlanView', () => {
  afterEach(cleanup)

  it('draws one footprint per cabinet', () => {
    draw(twoInARun())
    expect(screen.getAllByTestId(/^plan-cabinet-/)).toHaveLength(2)
  })

  it('selects the cabinet a footprint stands for', async () => {
    const { onSelect } = draw(twoInARun())
    await userEvent.click(screen.getByTestId('plan-cabinet-cmp_b'))
    expect(onSelect).toHaveBeenCalledWith('cmp_b')
  })

  it('marks the selected footprint and no other', () => {
    draw(twoInARun(), 'cmp_b')
    const marked = screen
      .getAllByTestId(/^plan-cabinet-/)
      .filter((c) => c.getAttribute('data-selected') === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-testid')).toBe('plan-cabinet-cmp_b')
  })

  it('sizes a footprint by width across and depth down', () => {
    draw(twoInARun())
    const a = screen.getByTestId('plan-cabinet-cmp_a')
    expect(Number(a.getAttribute('width'))).toBeCloseTo(600, 6)
    // Base 600 has an applied back, so the occupied depth exceeds the nominal 560.
    expect(Number(a.getAttribute('height'))).toBeGreaterThan(560)
  })

  it('puts the right-anchored neighbour to the right on screen', () => {
    draw(twoInARun())
    const a = screen.getByTestId('plan-cabinet-cmp_a')
    const b = screen.getByTestId('plan-cabinet-cmp_b')
    expect(Number(b.getAttribute('x'))).toBeGreaterThan(Number(a.getAttribute('x')))
  })

  // The flip, pinned on an ASYMMETRIC pair: a deeper cabinet's front edge is the same line as a
  // shallower one's when both are front-flush, so it must reach FURTHER UP the screen, not down.
  it('draws a deeper cabinet reaching further up the screen', () => {
    draw(twoInARun())
    const a = screen.getByTestId('plan-cabinet-cmp_a') // 560 deep
    const b = screen.getByTestId('plan-cabinet-cmp_b') // 500 deep
    expect(Number(a.getAttribute('y'))).toBeLessThan(Number(b.getAttribute('y')))
  })

  it('groups a run under one outline', () => {
    draw(twoInARun())
    expect(screen.getAllByTestId(/^plan-run-/)).toHaveLength(1)
  })

  it('draws a run per free-placed cabinet', () => {
    draw(sceneOf([cab('cmp_a', 600, 560), cab('cmp_b', 450, 500)]))
    expect(screen.getAllByTestId(/^plan-run-/)).toHaveLength(2)
  })

  it('says so when the job has no cabinets', () => {
    draw(sceneOf([]))
    expect(screen.getByText(/no cabinets/i)).toBeTruthy()
  })
})
