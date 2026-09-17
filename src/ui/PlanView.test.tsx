import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
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
  render(
    <PlanView
      scene={scene}
      selectedId={selected}
      onSelect={onSelect}
      onDrop={onDrop}
      onTurn={vi.fn()}
      warnings={[]}
    />,
  )
  return { onSelect, onDrop }
}


// happy-dom gives every element a zero rect, so the component cannot know its own scale. Pin one
// so the pixel-to-millimetre conversion is exercised at a known ratio.
const pinScale = () => {
  const svg = screen.getByRole('img', { name: 'Plan view' })
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 1450,
    height: 1000,
    top: 0,
    left: 0,
    right: 1450,
    bottom: 1000,
    toJSON: () => ({}),
  } as DOMRect)
}

// Each phase is act()-wrapped because the pointer listeners are attached by an effect: without a
// flush between pointerdown and pointermove, the move lands before anything is listening.
const dragBy = (testId: string, from: [number, number], to: [number, number]) => {
  pinScale()
  const el = screen.getByTestId(testId)
  act(() => {
    el.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: from[0], clientY: from[1], bubbles: true }),
    )
  })
  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: to[0], clientY: to[1], bubbles: true }),
    )
  })
  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: to[0], clientY: to[1], bubbles: true }),
    )
  })
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

  it('applies the drop a drag lands on', () => {
    const onDrop = vi.fn()
    render(
      <PlanView
        scene={twoInARun()}
        selectedId={null}
        onSelect={vi.fn()}
        onDrop={onDrop}
        onTurn={vi.fn()}
        warnings={[]}
      />,
    )
    dragBy('plan-cabinet-cmp_b', [700, 100], [900, 100])
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop.mock.calls[0][0]).toBe('cmp_b')
  })

  it('moves the dragged cabinet along x, not backwards into the job', () => {
    const onDrop = vi.fn()
    render(
      <PlanView
        scene={twoInARun()}
        selectedId={null}
        onSelect={vi.fn()}
        onDrop={onDrop}
        onTurn={vi.fn()}
        warnings={[]}
      />,
    )
    const before = twoInARun().components.find((c) => c.id === 'cmp_b')
    dragBy('plan-cabinet-cmp_b', [700, 100], [900, 100])

    const dropped = onDrop.mock.calls[0][1]
    expect(before?.kind).toBe('carcase')
    if (before?.kind !== 'carcase') return
    expect(dropped.x).toBeGreaterThan(before.position.x)
    expect(dropped.y).toBeCloseTo(before.position.y, 6)
    // A plan is seen from above; a drag cannot change a cabinet's height off the floor.
    expect(dropped.z).toBeCloseTo(before.position.z, 6)
  })

  // Dragging UP the screen must move a cabinet FURTHER BACK in world y, which is the sign flip
  // toSvg implies. Getting it backwards drags every cabinet the wrong way and looks fine until you
  // watch one.
  it('reads a drag up the screen as a move towards the back', () => {
    const onDrop = vi.fn()
    render(
      <PlanView
        scene={twoInARun()}
        selectedId={null}
        onSelect={vi.fn()}
        onDrop={onDrop}
        onTurn={vi.fn()}
        warnings={[]}
      />,
    )
    // clientY DECREASING is up the screen.
    dragBy('plan-cabinet-cmp_b', [700, 500], [700, 100])
    expect(onDrop.mock.calls[0][1].y).toBeGreaterThan(0)
  })

  it('does not report a drop for a click that never moved', () => {
    const onDrop = vi.fn()
    render(
      <PlanView
        scene={twoInARun()}
        selectedId={null}
        onSelect={vi.fn()}
        onDrop={onDrop}
        onTurn={vi.fn()}
        warnings={[]}
      />,
    )
    dragBy('plan-cabinet-cmp_b', [700, 100], [700, 100])
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('offers a turn control for the selected cabinet', () => {
    draw(twoInARun(), 'cmp_b')
    expect(screen.getByRole('button', { name: /rotate/i })).toBeTruthy()
  })

  it('offers no turn control when nothing is selected', () => {
    draw(twoInARun())
    expect(screen.queryByRole('button', { name: /rotate/i })).toBeNull()
  })

  it('asks to turn the selected cabinet', async () => {
    const onTurn = vi.fn()
    render(
      <PlanView
        scene={twoInARun()}
        selectedId="cmp_b"
        onSelect={vi.fn()}
        onDrop={vi.fn()}
        onTurn={onTurn}
        warnings={[]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /rotate/i }))
    expect(onTurn).toHaveBeenCalledWith('cmp_b')
  })

  it('marks the cabinet the corner check warns about and no other', () => {
    render(
      <PlanView
        scene={twoInARun()}
        selectedId={null}
        onSelect={vi.fn()}
        onDrop={vi.fn()}
        onTurn={vi.fn()}
        warnings={[{ cabinetId: 'cmp_b', targetId: 'cmp_a', required: 560, available: 340 }]}
      />,
    )
    expect(screen.getByTestId('plan-cabinet-cmp_b').getAttribute('data-warned')).toBe('true')
    expect(screen.getByTestId('plan-cabinet-cmp_a').getAttribute('data-warned')).toBe('false')
  })
})
