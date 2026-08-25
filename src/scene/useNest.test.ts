import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { NestResult } from '../nest/nest'
import type { BoardPart, MaterialDef, Part } from './types'

const mockNestJob = vi.fn()

vi.mock('comlink', () => ({
  wrap: () => ({ nestJob: mockNestJob }),
  expose: vi.fn(),
}))
const WorkerCtor = vi.fn(function MockWorker() {})
vi.stubGlobal('Worker', WorkerCtor)

const { useNest } = await import('./useNest')

const EMPTY: NestResult = { sheets: [], utilisation: [], unplaced: [] }

function board(over: Partial<BoardPart> & { id: string }): BoardPart {
  return {
    kind: 'board',
    label: over.id,
    length: 600,
    width: 300,
    thickness: 18,
    grain: 'free',
    material: '18mm Ply',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...over,
  }
}

const PLY: MaterialDef = { sheet: { length: 2440, width: 1220 } }

beforeEach(() => {
  mockNestJob.mockReset()
  mockNestJob.mockResolvedValue(EMPTY)
  WorkerCtor.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function settle() {
  await act(async () => {
    vi.runAllTimers()
  })
}

describe('useNest', () => {
  // The whole point of the gating decision: a 5.4 s job must not run for a tab nobody has open.
  it('does no work at all while disabled', async () => {
    renderHook(() => useNest([board({ id: 'a' })], { '18mm Ply': PLY }, 14, false))
    await settle()
    expect(mockNestJob).not.toHaveBeenCalled()
    expect(WorkerCtor).not.toHaveBeenCalled()
  })

  it('nests a material that has sheet stock', async () => {
    const { result } = renderHook(() =>
      useNest([board({ id: 'a' })], { '18mm Ply': PLY }, 14, true),
    )
    await settle()
    await waitFor(() => expect(mockNestJob).toHaveBeenCalledTimes(1))
    expect(mockNestJob.mock.calls[0][0]).toMatchObject({
      clearance: 14,
      sheet: { length: 2440, width: 1220 },
      hasGrain: true,
    })
    await waitFor(() => expect(result.current.reports).toHaveLength(1))
    expect(result.current.reports[0].material).toBe('18mm Ply')
  })

  it('skips a material with no sheet, and one with a zero dimension', async () => {
    renderHook(() =>
      useNest(
        [board({ id: 'a', material: 'MDF' }), board({ id: 'b', material: 'Half' })],
        { MDF: { costPerM2: 40 }, Half: { sheet: { length: 2440, width: 0 } } },
        14,
        true,
      ),
    )
    await settle()
    expect(mockNestJob).not.toHaveBeenCalled()
  })

  it('skips a board whose material has no entry at all', async () => {
    renderHook(() => useNest([board({ id: 'a', material: 'Unknown' })], {}, 14, true))
    await settle()
    expect(mockNestJob).not.toHaveBeenCalled()
  })

  it('groups boards by material, one job each', async () => {
    renderHook(() =>
      useNest(
        [
          board({ id: 'a', material: '18mm Ply' }),
          board({ id: 'b', material: '18mm Ply' }),
          board({ id: 'c', material: 'MDF' }),
        ],
        { '18mm Ply': PLY, MDF: { sheet: { length: 2440, width: 1220 }, hasGrain: false } },
        14,
        true,
      ),
    )
    await settle()
    await waitFor(() => expect(mockNestJob).toHaveBeenCalledTimes(2))
    const jobs = mockNestJob.mock.calls.map((c) => c[0] as { parts: Part[]; hasGrain: boolean })
    expect(jobs.map((j) => j.parts.length).sort()).toEqual([1, 2])
    expect(jobs.map((j) => j.hasGrain).sort()).toEqual([false, true])
  })

  it('treats an absent hasGrain as grained, matching the Library checkbox', async () => {
    renderHook(() => useNest([board({ id: 'a' })], { '18mm Ply': PLY }, 14, true))
    await settle()
    await waitFor(() => expect(mockNestJob).toHaveBeenCalled())
    expect((mockNestJob.mock.calls[0][0] as { hasGrain: boolean }).hasGrain).toBe(true)
  })

  it('ignores cylinders', async () => {
    const dowel: Part = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel',
      diameter: 8,
      length: 40,
      material: '18mm Ply',
      color: '#fff',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    }
    renderHook(() => useNest([dowel], { '18mm Ply': PLY }, 14, true))
    await settle()
    expect(mockNestJob).not.toHaveBeenCalled()
  })

  // A nest takes seconds, so two runs overlapping is the normal case rather than an edge one. A
  // stale result landing last would show a nest for a scene the user has already changed.
  it('does not let a superseded run overwrite a newer one', async () => {
    const slow: NestResult = { sheets: [[]], utilisation: [0.1], unplaced: ['stale'] }
    const fresh: NestResult = { sheets: [[]], utilisation: [0.9], unplaced: ['fresh'] }
    let releaseSlow: (r: NestResult) => void = () => {}
    mockNestJob
      .mockImplementationOnce(() => new Promise<NestResult>((res) => (releaseSlow = res)))
      .mockResolvedValueOnce(fresh)

    const { result, rerender } = renderHook(
      ({ parts }: { parts: Part[] }) => useNest(parts, { '18mm Ply': PLY }, 14, true),
      { initialProps: { parts: [board({ id: 'a' })] as Part[] } },
    )
    await settle()

    rerender({ parts: [board({ id: 'a' }), board({ id: 'b' })] })
    await settle()
    await waitFor(() => expect(mockNestJob).toHaveBeenCalledTimes(2))

    // The first job finishes LAST. Its result is stale and must be discarded.
    await act(async () => {
      releaseSlow(slow)
    })
    await waitFor(() => expect(result.current.reports).toHaveLength(1))
    expect(result.current.reports[0].result.unplaced).toEqual(['fresh'])
  })

  it('reports pending while a job is in flight', async () => {
    let release: (r: NestResult) => void = () => {}
    mockNestJob.mockImplementationOnce(() => new Promise<NestResult>((res) => (release = res)))

    const { result } = renderHook(() => useNest([board({ id: 'a' })], { '18mm Ply': PLY }, 14, true))
    await settle()
    await waitFor(() => expect(result.current.pending).toBe(true))

    await act(async () => {
      release(EMPTY)
    })
    await waitFor(() => expect(result.current.pending).toBe(false))
  })
})
