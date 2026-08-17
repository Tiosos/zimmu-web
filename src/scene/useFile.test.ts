import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('./idb', () => ({
  readHandle: vi.fn(),
  writeHandle: vi.fn(),
  clearHandle: vi.fn(),
}))

import { useFile, parseFile } from './useFile'
import * as idb from './idb'
import type { ZimmuFile, Scene, Part } from './types'

const CAMERA = { position: { x: 250, y: -200, z: 150 }, target: { x: 0, y: 0, z: 0 } }

const FIXTURE: ZimmuFile = {
  version: 1,
  name: 'Garden Shelf',
  appVersion: '0.0.0',
  units: 'mm',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  camera: CAMERA,
  scene: { parts: [], materials: {}, hardware: [], joints: [] },
}

function makeInput(overrides?: Partial<Parameters<typeof useFile>[0]>) {
  return {
    scene: { parts: [], materials: {}, hardware: [], joints: [] },
    getCameraState: () => CAMERA,
    onFileLoaded: vi.fn(),
    ...overrides,
  }
}

describe('useFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(idb.readHandle).mockResolvedValue(null)
    vi.mocked(idb.writeHandle).mockResolvedValue(undefined)
    vi.mocked(idb.clearHandle).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('no stored handle: fileReady true, onFileLoaded not called', async () => {
    const onFileLoaded = vi.fn()
    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))
    expect(onFileLoaded).not.toHaveBeenCalled()
    expect(result.current.isDirty).toBe(false)
  })

  it('valid stored handle: calls onFileLoaded, sets fileName and projectName', async () => {
    const mockHandle = {
      name: 'shelf.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(FIXTURE)),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    expect(onFileLoaded).toHaveBeenCalledWith(expect.objectContaining({ name: 'Garden Shelf' }))
    expect(result.current.fileName).toBe('shelf.zimmu')
    expect(result.current.projectName).toBe('Garden Shelf')
    expect(result.current.isDirty).toBe(false)
  })

  it('stored handle with permission prompt: falls back silently, does not call requestPermission', async () => {
    const mockHandle = {
      name: 'shelf.zimmu',
      queryPermission: vi.fn().mockResolvedValue('prompt'),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    expect(onFileLoaded).not.toHaveBeenCalled()
    expect(result.current.fileName).toBeNull()
    expect(
      (mockHandle as unknown as { requestPermission?: () => void }).requestPermission,
    ).toBeUndefined()
  })

  it('stale handle (getFile throws): falls back, fileReady true, no fileError', async () => {
    const mockHandle = {
      name: 'shelf.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockRejectedValue(new Error('not found')),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)

    const { result } = renderHook(() => useFile(makeInput()))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    expect(result.current.fileError).toBeNull()
    expect(result.current.fileName).toBeNull()
  })

  it('saveFile with no handle: shows picker, writes, stores IDB, isDirty false', async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const mockHandle = {
      name: 'project.zimmu',
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    } as unknown as FileSystemFileHandle
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(mockHandle))

    const { result } = renderHook(() => useFile(makeInput()))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    await act(async () => {
      await result.current.saveFile()
    })

    expect(window.showSaveFilePicker).toHaveBeenCalled()
    expect(mockWritable.close).toHaveBeenCalled()
    expect(idb.writeHandle).toHaveBeenCalledWith(mockHandle)
    expect(result.current.fileName).toBe('project.zimmu')
    expect(result.current.isDirty).toBe(false)
  })

  it('saveFile with existing handle: no picker, writes directly', async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const storedHandle = {
      name: 'shelf.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi
        .fn()
        .mockResolvedValue({ text: vi.fn().mockResolvedValue(JSON.stringify(FIXTURE)) }),
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(storedHandle)
    vi.stubGlobal('showSaveFilePicker', vi.fn())

    const { result } = renderHook(() => useFile(makeInput()))
    await waitFor(() => expect(result.current.fileName).toBe('shelf.zimmu'))

    await act(async () => {
      await result.current.saveFile()
    })

    expect(window.showSaveFilePicker).not.toHaveBeenCalled()
    expect(mockWritable.close).toHaveBeenCalled()
  })

  it('openFile dirty + user cancels: no-op, onFileLoaded not called', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    const onFileLoaded = vi.fn()

    const mockPart = {
      kind: 'board' as const,
      id: 'b1',
      label: 'Board 1',
      length: 200,
      width: 100,
      thickness: 25,
      material: '',
      color: '#aaa',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      {
        initialProps: {
          scene: { parts: [] as Scene['parts'], materials: {}, hardware: [], joints: [] },
        },
      },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart], materials: {}, hardware: [], joints: [] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(window.confirm).toHaveBeenCalled()
    expect(window.showOpenFilePicker).not.toHaveBeenCalled()
    expect(onFileLoaded).not.toHaveBeenCalled()
  })

  it('openFile dirty + user confirms: proceeds, calls onFileLoaded', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockFile = { text: vi.fn().mockResolvedValue(JSON.stringify(FIXTURE)) }
    const openHandle = {
      name: 'new.zimmu',
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValue([openHandle]))
    vi.mocked(idb.writeHandle).mockResolvedValue(undefined)
    const onFileLoaded = vi.fn()

    const mockPart = {
      kind: 'board' as const,
      id: 'b1',
      label: 'Board 1',
      length: 200,
      width: 100,
      thickness: 25,
      material: '',
      color: '#aaa',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      {
        initialProps: {
          scene: { parts: [] as Scene['parts'], materials: {}, hardware: [], joints: [] },
        },
      },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart], materials: {}, hardware: [], joints: [] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(onFileLoaded).toHaveBeenCalledWith(expect.objectContaining({ name: 'Garden Shelf' }))
  })

  it('picker AbortError: no fileError, no state change', async () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockRejectedValue(err))

    const { result } = renderHook(() => useFile(makeInput()))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(result.current.fileError).toBeNull()
  })

  it('saveFile close() throws: fileError set, writeHandle not called', async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockRejectedValue(new Error('disk full')),
    }
    const mockHandle = {
      name: 'p.zimmu',
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    } as unknown as FileSystemFileHandle
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(mockHandle))

    const { result } = renderHook(() => useFile(makeInput()))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    await act(async () => {
      await result.current.saveFile()
    })

    expect(result.current.fileError).toBe('Save failed')
    expect(idb.writeHandle).not.toHaveBeenCalled()
  })

  it('fileError auto-clears after 5 seconds', async () => {
    vi.useFakeTimers()
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockRejectedValue(new Error('disk full')),
    }
    const mockHandle = {
      name: 'p.zimmu',
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    } as unknown as FileSystemFileHandle
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(mockHandle))
    vi.mocked(idb.readHandle).mockResolvedValue(null)

    const { result } = renderHook(() => useFile(makeInput()))
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    await act(async () => {
      await result.current.saveFile()
    })
    expect(result.current.fileError).toBe('Save failed')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.fileError).toBeNull()

    vi.useRealTimers()
  })

  it('serialization rounds floats to 6 decimal places', async () => {
    let writtenContent = ''
    const mockWritable = {
      write: vi.fn().mockImplementation((c: string) => {
        writtenContent = c
        return Promise.resolve()
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const mockHandle = {
      name: 'p.zimmu',
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    } as unknown as FileSystemFileHandle
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(mockHandle))

    const part = {
      kind: 'board' as const,
      id: 'b1',
      label: 'Board 1',
      length: 200,
      width: 100.1234567,
      thickness: 25,
      material: '',
      color: '#aaa',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
    }
    const { result } = renderHook(() =>
      useFile(makeInput({ scene: { parts: [part], materials: {}, hardware: [], joints: [] } })),
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    await act(async () => {
      await result.current.saveFile()
    })

    const parsed = JSON.parse(writtenContent) as ZimmuFile
    const part0 = parsed.scene.parts[0]
    expect(part0.kind === 'board' && part0.width).toBe(100.123457)
  })

  it('version > FILE_FORMAT_VERSION: warns and parses successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockHandle = {
      name: 'future.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify({ ...FIXTURE, version: 99 })),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('version 99'))
    expect(onFileLoaded).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('unknown part kind: filters it out, loads the rest', async () => {
    const mixedScene = {
      parts: [
        { kind: 'unknown-joint', id: 'j1' },
        {
          kind: 'board',
          id: 'b1',
          label: 'Board 1',
          length: 200,
          width: 100,
          thickness: 25,
          color: '#aaa',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
        },
      ],
    }
    const mockHandle = {
      name: 'mixed.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify({ ...FIXTURE, scene: mixedScene })),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    const loaded = vi.mocked(onFileLoaded).mock.calls[0][0] as ZimmuFile
    expect(loaded.scene.parts).toHaveLength(1)
    expect(loaded.scene.parts[0].kind).toBe('board')
  })

  // parseFile only warns on a newer file version and parses on, so a joint kind from a future
  // release would otherwise survive into the render path, where jointChecklist's jointPairIds
  // exhaustiveness guard throws and blanks the app instead of degrading.
  it('parseFile drops an unknown joint kind and keeps the known ones', () => {
    const raw = JSON.stringify({
      version: 99,
      name: 'T',
      appVersion: 'x',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [
          { kind: 'dovetail', id: 'j1', label: 'Dovetail 1', partAId: 'a', partBId: 'b' },
          { kind: 'halflap', id: 'j2', label: 'Half-lap 1', partAId: 'a', partBId: 'b' },
        ],
      },
    })
    const parsed = parseFile(raw)
    expect(parsed.scene.joints).toHaveLength(1)
    expect(parsed.scene.joints[0].kind).toBe('halflap')
  })

  // Pre-v7 files carry joints with no `kind` at all — they are all dados. The unknown-kind filter
  // must not mistake a missing kind for an unknown one.
  it('parseFile keeps a legacy joint that carries no kind', () => {
    const raw = JSON.stringify({
      version: 6,
      name: 'T',
      appVersion: 'x',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [{ id: 'j1', label: 'Dado 1', housingPartId: 'a', housedPartId: 'b' }],
      },
    })
    const parsed = parseFile(raw)
    expect(parsed.scene.joints).toHaveLength(1)
    expect(parsed.scene.joints[0].kind).toBe('dado')
  })

  it('parseFile preserves cylinder (dowel) parts', () => {
    const raw = JSON.stringify({
      version: 2,
      name: 'T',
      appVersion: 'x',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'cylinder',
            id: 'd1',
            label: 'Dowel 1',
            diameter: 8,
            length: 100,
            material: 'Beech',
            color: '#888888',
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            visible: true,
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    })
    const parsed = parseFile(raw)
    expect(parsed.scene.parts).toHaveLength(1)
    const p = parsed.scene.parts[0]
    expect(p.kind).toBe('cylinder')
    if (p.kind === 'cylinder') {
      expect(p.diameter).toBe(8)
      expect(p.length).toBe(100)
      expect(p.material).toBe('Beech')
    }
    if (p.kind === 'cylinder') expect(p.cuts).toEqual([])
  })

  it('setProjectName marks isDirty true and updates projectName', async () => {
    // Stable scene reference prevents the dirty-tracking effect from firing on
    // setProjectName re-renders and overwriting isDirty=true with false.
    const input = makeInput()
    const { result } = renderHook(() => useFile(input))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    act(() => {
      result.current.setProjectName('My Shelf')
    })

    expect(result.current.projectName).toBe('My Shelf')
    expect(result.current.isDirty).toBe(true)
  })

  it('newFile: clears fileName, resets isDirty, calls clearHandle', async () => {
    const storedHandle = {
      name: 'shelf.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi
        .fn()
        .mockResolvedValue({ text: vi.fn().mockResolvedValue(JSON.stringify(FIXTURE)) }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(storedHandle)
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileName).toBe('shelf.zimmu'))

    await act(async () => {
      await result.current.newFile()
    })

    expect(result.current.fileName).toBeNull()
    expect(result.current.isDirty).toBe(false)
    expect(idb.clearHandle).toHaveBeenCalled()
    expect(onFileLoaded).toHaveBeenCalledTimes(2) // once on startup, once on newFile
  })

  it('defaults cuts to [] when loading a file without cut data', async () => {
    const fixtureNoCuts: ZimmuFile = {
      ...FIXTURE,
      scene: {
        parts: [
          {
            kind: 'board' as const,
            id: 'board_old',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            // no cuts field — simulates a pre-cuts file
          } as unknown as Part,
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    }

    const mockHandle = {
      name: 'old.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(fixtureNoCuts)),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)

    const onFileLoaded = vi.fn()
    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    const envelope = onFileLoaded.mock.calls[0][0] as ZimmuFile
    const part0 = envelope.scene.parts[0]
    expect(part0.kind === 'board' ? part0.cuts : null).toEqual([])
  })

  it('defaults visible to true when loading a file without visible data', async () => {
    const fixtureNoVisible: ZimmuFile = {
      ...FIXTURE,
      scene: {
        parts: [
          {
            kind: 'board' as const,
            id: 'board_old',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            cuts: [],
            // no visible field — simulates a pre-visible file
          } as unknown as Part,
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    }

    const mockHandle = {
      name: 'old.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(fixtureNoVisible)),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    const loaded = vi.mocked(onFileLoaded).mock.calls[0][0] as ZimmuFile
    expect(loaded.scene.parts[0].visible).toBe(true)
  })

  it("defaults material to '' when loading a file without material data", async () => {
    const fixtureNoMaterial: ZimmuFile = {
      ...FIXTURE,
      scene: {
        parts: [
          {
            kind: 'board' as const,
            id: 'board_old',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            cuts: [],
            visible: true,
            // no material field — simulates a pre-material file
          } as unknown as Part,
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    }

    const mockHandle = {
      name: 'old.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(fixtureNoMaterial)),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    const loaded = vi.mocked(onFileLoaded).mock.calls[0][0] as ZimmuFile
    expect(loaded.scene.parts[0].material).toBe('')
  })

  it('v2→v3: legacy cuts without a kind default to box', () => {
    const v2Json = JSON.stringify({
      version: 2,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: 'x',
      updatedAt: 'x',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'B',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            material: '',
            visible: true,
            cuts: [
              {
                id: 'cut_1',
                label: 'Dado',
                face: '+Z',
                position: { x: 0, y: 0, z: 0 },
                size: { x: 20, y: 20, z: 10 },
              },
            ],
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    })
    const result = parseFile(v2Json)
    const part = result.scene.parts[0]
    if (part.kind !== 'board') throw new Error('expected board')
    expect(part.cuts[0].kind).toBe('box')
  })

  it('preserves a mitre cut on load (v3 round-trip)', () => {
    const v3Json = JSON.stringify({
      version: 3,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: 'x',
      updatedAt: 'x',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'B',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            material: '',
            visible: true,
            cuts: [{ kind: 'mitre', id: 'm1', label: 'Mitre', end: '+X', axis: 'Z', angle: 45 }],
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    })
    const part = parseFile(v3Json).scene.parts[0]
    if (part.kind !== 'board') throw new Error('expected board')
    const cut = part.cuts[0]
    expect(cut).toMatchObject({ kind: 'mitre', end: '+X', axis: 'Z', angle: 45 })
  })

  it('v4→v5: legacy joint without profile fields defaults to plain', () => {
    const v4Json = JSON.stringify({
      version: 4,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: 'x',
      updatedAt: 'x',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [
          {
            kind: 'dado',
            id: 'j1',
            label: 'Dado 1',
            housingPartId: 'H',
            housingFace: '+Z',
            housedPartId: 'D',
            housedEnd: '+X',
            offset: 50,
            depth: 8,
            clearance: 0,
            // no profile/tongueThickness/rabbetFace — simulates a pre-v5 joint
          },
        ],
      },
    })
    const result = parseFile(v4Json)
    const joint = result.scene.joints[0]
    expect(joint).toMatchObject({ profile: 'plain', tongueThickness: 6, rabbetFace: '+Z' })
  })

  it('v5: joint with profile fields already present are preserved (not overwritten)', () => {
    const v5Json = JSON.stringify({
      version: 5,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: 'x',
      updatedAt: 'x',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [
          {
            kind: 'dado',
            id: 'j1',
            label: 'Dado 1',
            housingPartId: 'H',
            housingFace: '+Z',
            housedPartId: 'D',
            housedEnd: '+X',
            offset: 50,
            depth: 8,
            clearance: 0,
            profile: 'rabbeted',
            tongueThickness: 10,
            rabbetFace: '-Z',
          },
        ],
      },
    })
    const result = parseFile(v5Json)
    const joint = result.scene.joints[0]
    expect(joint).toMatchObject({ profile: 'rabbeted', tongueThickness: 10, rabbetFace: '-Z' })
  })

  it('v5→v6: legacy joint without stop fields defaults to through (stopStart/stopEnd = 0)', () => {
    const v5Json = JSON.stringify({
      version: 5,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: CAMERA,
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [
          {
            kind: 'dado',
            id: 'j1',
            label: 'Dado 1',
            housingPartId: 'H',
            housingFace: '+Z',
            housedPartId: 'D',
            housedEnd: '+X',
            offset: 50,
            depth: 8,
            clearance: 0,
            profile: 'plain',
            tongueThickness: 6,
            rabbetFace: '+Z',
            // no stopStart/stopEnd — simulates a pre-v6 joint
          },
        ],
      },
    })
    const result = parseFile(v5Json)
    expect(result.scene.joints[0]).toMatchObject({ stopStart: 0, stopEnd: 0 })
  })

  it('defaults materials and hardware for v1 files', () => {
    const v1Json = JSON.stringify({
      version: 1,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: 'x',
      updatedAt: 'x',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: { parts: [] },
    })
    const result = parseFile(v1Json)
    expect(result.scene.materials).toEqual({})
    expect(result.scene.hardware).toEqual([])
  })

  it('preserves visible: false when loading a file with a hidden part', async () => {
    const fixtureHidden: ZimmuFile = {
      ...FIXTURE,
      scene: {
        parts: [
          {
            kind: 'board' as const,
            id: 'board_hidden',
            label: 'Hidden Board',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            cuts: [],
            material: '',
            visible: false,
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    }

    const mockHandle = {
      name: 'hidden.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(fixtureHidden)),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    const loaded = vi.mocked(onFileLoaded).mock.calls[0][0] as ZimmuFile
    expect(loaded.scene.parts[0].visible).toBe(false)
  })
})
