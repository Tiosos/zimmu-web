import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { ManufacturingReadiness } from './ManufacturingReadiness'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { DEFAULT_FRAME, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { Scene } from '../scene/types'
import { createReadinessSnapshot } from '../scene/readinessSnapshot'
import * as pdf from './buildReadinessPdf'
import * as downloads from './download'
import * as packets from './buildProductionPacket'

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
  it('shows drilling cut ownership, inspects the part and exports the same captured findings', async () => {
    const scene = structuredClone(sceneOf())
    const part = scene.parts.find((p) => p.kind === 'board')!
    if (part.kind !== 'board') throw new Error('Expected board')
    part.cuts = [
      {
        kind: 'hole-array',
        id: 'drill-ui',
        label: 'Screw clearance',
        face: '+Z',
        axis: 'U',
        start: { x: 1, y: 30, z: part.thickness },
        pitch: 0,
        count: 1,
        diameter: 5,
        depth: part.thickness * 2,
        sourceJointId: 'joint-ui',
      },
    ]
    const inspect = vi.fn()
    const build = vi.spyOn(pdf, 'buildReadinessPdf').mockResolvedValue(new Uint8Array([37, 80]))
    vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    render(
      <ManufacturingReadiness
        scene={scene}
        onClose={vi.fn()}
        onOpenSheet={vi.fn()}
        onInspect={inspect}
      />,
    )
    const section = screen.getByRole('region', { name: 'Manufacturing record checks' })
    expect(within(section).getByText(/drilling-bounds:/)).toBeTruthy()
    const finding = within(section)
      .getByText(/Cut drill-ui.*Joint joint-ui/)
      .closest('div')!
    fireEvent.click(within(finding).getByRole('button', { name: `Inspect ${part.label}` }))
    expect(inspect).toHaveBeenCalledWith({ kind: 'part', id: part.id })
    fireEvent.click(screen.getByRole('button', { name: 'Export readiness PDF' }))
    await waitFor(() => expect(build).toHaveBeenCalledOnce())
    expect(
      build.mock.calls[0][0].manufacturing.findings.find((f) => f.code === 'drilling-bounds')
        ?.operation,
    ).toMatchObject({ id: 'drill-ui', sourceJointId: 'joint-ui' })
  })

  it('caps the dialog display and exports every finding with the same effective stock', async () => {
    const scene = structuredClone(sceneOf())
    const template = scene.parts.find((p) => p.kind === 'board')!
    scene.parts = Array.from({ length: 205 }, (_, i) => ({
      ...structuredClone(template),
      id: `review-part-${i}`,
      label: '',
      parentId: null,
      driven: false,
      material: 'Library panel',
      edgeBanding: undefined,
      cuts: [],
      overrides: undefined,
    }))
    scene.components = []
    const materialLibrary = {
      'Library panel': { thickness: template.kind === 'board' ? template.thickness : 18 },
    }
    const build = vi.spyOn(pdf, 'buildReadinessPdf').mockResolvedValue(new Uint8Array([37, 80]))
    vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    render(
      <ManufacturingReadiness
        scene={scene}
        materialLibrary={materialLibrary}
        onClose={vi.fn()}
        onOpenSheet={vi.fn()}
      />,
    )
    const section = screen.getByRole('region', { name: 'Manufacturing record checks' })
    expect(within(section).getAllByText(/label-empty:/)).toHaveLength(200)
    expect(within(section).getByText(/Showing the first 200/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Export readiness PDF' }))
    await waitFor(() => expect(build).toHaveBeenCalledOnce())
    const exported = build.mock.calls[0][0].manufacturing
    expect(exported).toEqual(
      createReadinessSnapshot(scene, 'Project', new Date(), materialLibrary).manufacturing,
    )
    expect(exported.findings).toHaveLength(205)
    expect(exported.findings.at(-1)?.targets[0].id).toBe('review-part-204')
  })

  it('shows advisory record issues, inspects stable IDs and updates with the material library', () => {
    const scene = structuredClone(sceneOf())
    const part = scene.parts[0]
    part.material = 'Library board'
    const inspect = vi.fn()
    const props = { scene, onClose: vi.fn(), onOpenSheet: vi.fn(), onInspect: inspect }
    const view = render(<ManufacturingReadiness {...props} />)
    const section = screen.getByRole('region', { name: 'Manufacturing record checks' })
    expect(within(section).getByText(/Material "Library board" is unresolved/)).toBeTruthy()
    fireEvent.click(within(section).getAllByRole('button', { name: `Inspect ${part.label}` })[0])
    expect(inspect).toHaveBeenCalledWith({ kind: 'part', id: part.id })
    expect(
      screen.getByRole('button', { name: 'Export readiness PDF' }).hasAttribute('disabled'),
    ).toBe(false)
    view.rerender(
      <ManufacturingReadiness
        {...props}
        materialLibrary={{
          'Library board': { thickness: part.kind === 'board' ? part.thickness : 18 },
        }}
      />,
    )
    expect(within(section).queryByText(/Material "Library board" is unresolved/)).toBeNull()
    expect(within(section).getByText(/Machine operation compatibility/)).toBeTruthy()
  })

  it('shows whether the drawings and the cutlist agree', () => {
    render(<ManufacturingReadiness scene={sceneOf()} onClose={vi.fn()} onOpenSheet={vi.fn()} />)
    const section = screen
      .getByText('Production packet drawings and lists agree?')
      .closest('section') as HTMLElement
    expect(within(section).getByText(/Passed/)).toBeTruthy()
  })

  it('downloads a packet from the scene and recovers from a failed attempt', async () => {
    const build = vi
      .spyOn(packets, 'buildProductionPacket')
      .mockRejectedValueOnce(new Error('packet test failure'))
      .mockResolvedValue(new Uint8Array([80, 75]))
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    const scene = sceneOf()
    render(
      <ManufacturingReadiness
        scene={scene}
        projectName="Workshop A"
        materialLibrary={{ Plywood: { costPerM2: 42 } }}
        onClose={vi.fn()}
        onOpenSheet={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export production packet' }))
    expect(screen.getByRole('button', { name: 'Preparing packet…' }).hasAttribute('disabled')).toBe(
      true,
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('packet test failure'),
    )
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Export production packet' }))
    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(build.mock.calls[1][0]).toMatchObject({
      scene,
      projectName: 'Workshop A',
      materialLibrary: { Plywood: { costPerM2: 42 } },
    })
    expect(download.mock.calls[0].slice(1)).toEqual([
      'Workshop A-production-packet.zip',
      'application/zip',
    ])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('downloads a captured snapshot and recovers from export failures', async () => {
    const build = vi
      .spyOn(pdf, 'buildReadinessPdf')
      .mockRejectedValueOnce(new Error('test failure'))
      .mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    const scene = sceneOf()
    render(
      <ManufacturingReadiness
        scene={scene}
        projectName="Workshop A"
        onClose={vi.fn()}
        onOpenSheet={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export readiness PDF' }))
    expect(screen.getByRole('button', { name: 'Preparing PDF…' }).hasAttribute('disabled')).toBe(
      true,
    )
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('test failure'))
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Export readiness PDF' }))
    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(download.mock.calls[0][1]).toBe('Workshop A-manufacturing-readiness.pdf')
    expect(build.mock.calls[1][0].projectName).toBe('Workshop A')
    expect(build.mock.calls[1][0].cabinets[0].generated).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

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
