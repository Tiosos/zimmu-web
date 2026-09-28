import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { ManufacturingReadiness } from './ManufacturingReadiness'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { DEFAULT_FRAME, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { Scene } from '../scene/types'

vi.mock('./ShelfInsertionCanvas', () => ({
  ShelfInsertionCanvas: () => <div>Preview geometry</div>,
}))
const sceneOf = (): Scene => ({
  components: [cabinet],
  parts: partsOfCarcase(cabinet.params),
  materials: PRESET_MATERIALS,
  hardware: [],
  joints: [],
})
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute('open')
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('readiness UI', () => {
  it('links production findings to the affected cabinet without altering the scene', () => {
    const scene = sceneOf()
    scene.parts = scene.parts.filter((p) => p.role !== 'bottom')
    const before = JSON.stringify(scene)
    const inspect = vi.fn()
    render(
      <ManufacturingReadiness
        scene={scene}
        onClose={vi.fn()}
        onOpenSheet={vi.fn()}
        onInspect={inspect}
      />,
    )
    const section = screen.getByRole('region', { name: 'Production checks' })
    expect(within(section).getByText(/Missing generated part: Bottom/)).toBeTruthy()
    fireEvent.click(within(section).getAllByRole('button', { name: 'Inspect Base 600' })[0])
    expect(inspect).toHaveBeenCalledWith({ kind: 'component', id: cabinet.id })
    expect(JSON.stringify(scene)).toBe(before)
    expect(screen.getByText(/exports remain available/)).toBeTruthy()
  })

  it('keeps oversized reports usable without rows or false zero totals, then recovers', () => {
    const scene = sceneOf()
    scene.components = [
      {
        ...cabinet,
        params: {
          ...cabinet.params,
          section: {
            ...cabinet.params.section,
            interior: {
              ...cabinet.params.section.interior!,
              adjustable: {
                ...cabinet.params.section.interior!.adjustable,
                shelves: 1e12,
              },
            },
          },
        },
      },
    ]
    const close = vi.fn()
    const view = render(
      <ManufacturingReadiness scene={scene} onClose={close} onOpenSheet={vi.fn()} />,
    )
    expect(screen.getByRole('status').textContent).toContain('1000000000000 requested')
    expect(screen.getByRole('status').textContent).toContain('unknown missing')
    expect(screen.getByRole('status').textContent).toContain('unknown without a verified route')
    expect(screen.getByText(/exceeds the report limit/)).toBeTruthy()
    expect(screen.queryByText('No adjustable shelves requested.')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Installation sheet' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close readiness report' }))
    expect(close).toHaveBeenCalledOnce()
    view.rerender(
      <ManufacturingReadiness scene={sceneOf()} onClose={close} onOpenSheet={vi.fn()} />,
    )
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(
      '1 requested · 1 generated · 0 missing',
    )
  })

  it('opens the existing preview, keeps the report on preview Escape, and links to the exact sheet', () => {
    const onClose = vi.fn(),
      onOpenSheet = vi.fn()
    render(<ManufacturingReadiness scene={sceneOf()} onClose={onClose} onOpenSheet={onOpenSheet} />)
    const report = screen.getByRole('dialog', { name: 'Manufacturing readiness' })
    expect(within(report).getByRole('status').textContent).toContain('1 requested · 1 generated')
    fireEvent.click(within(report).getByRole('button', { name: 'Preview shelf insertion' }))
    const preview = screen.getByRole('dialog', { name: /Shelf insertion/ })
    expect(within(preview).getByRole('status').textContent).toBe('Straight insertion')
    fireEvent(preview, new Event('cancel', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: /Shelf insertion/ })).toBeNull()
    fireEvent.click(within(report).getByRole('button', { name: 'Installation sheet' }))
    expect(onOpenSheet).toHaveBeenCalledWith(cabinet, expect.stringMatching(/^adj-shelf-/))
  })

  it('shows omissions, allows inspection of declined shelves, and refreshes when scene changes', () => {
    const scene = sceneOf()
    const view = render(
      <ManufacturingReadiness scene={scene} onClose={vi.fn()} onOpenSheet={vi.fn()} />,
    )
    const params = {
      ...cabinet.params,
      height: 300,
      frame: { ...DEFAULT_FRAME, pairStile: true },
      section: {
        ...cabinet.params.section,
        front: { kind: 'door' as const, leaves: 2 as const, hinge: 'left' as const },
      },
    }
    view.rerender(
      <ManufacturingReadiness
        scene={{ ...scene, components: [{ ...cabinet, params }], parts: partsOfCarcase(params) }}
        onClose={vi.fn()}
        onOpenSheet={vi.fn()}
      />,
    )
    expect(screen.getByText('No — omitted')).toBeTruthy()
    expect(screen.getByText('No verified insertion route')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Installation sheet' }).hasAttribute('disabled'),
    ).toBe(false)
    expect(screen.getByText(/exports remain available/)).toBeTruthy()
  })

  it('reports empty projects and prevents report shortcuts from editing the scene', () => {
    const key = vi.fn(),
      close = vi.fn()
    window.addEventListener('keydown', key)
    render(
      <ManufacturingReadiness
        scene={{ ...sceneOf(), components: [] }}
        onClose={close}
        onOpenSheet={vi.fn()}
      />,
    )
    expect(screen.getByText('No cabinets to assess.')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Delete' })
    expect(key).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close readiness report' }))
    expect(close).toHaveBeenCalledOnce()
    window.removeEventListener('keydown', key)
  })
})
