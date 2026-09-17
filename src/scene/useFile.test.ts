import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('./idb', () => ({
  readHandle: vi.fn(),
  writeHandle: vi.fn(),
  clearHandle: vi.fn(),
}))

import { useFile, parseFile, FILE_FORMAT_VERSION } from './useFile'
import * as idb from './idb'
import type { BoardPart, CarcaseParams, MaterialDef, ZimmuFile, Scene, Part } from './types'
import type { Section } from './sectionTree'
import { firstInterior, seedInteriors } from './sectionInterior'
import { legacyToSection } from './migrateSections'
import { defaultScrewJoint } from './defaultJoint'
import { carcaseBoxes as boxesOf, validateCarcaseParams as validateOf } from './carcaseRoles'
import { PRESET_MATERIALS } from './carcasePresets'
import { roleThicknessFor } from './resolveThickness'

// A pre-v14 file states one thickness per carcase; the v14 migration turns those into material
// definitions. Every legacy fixture below is 18 mm ply on a 12 mm back, which migrates to exactly
// the two definitions a new scene is seeded with, so that is the record these assertions resolve
// against. The migration's own naming is asserted in the v13 → v14 block.
const carcaseBoxes = (p: CarcaseParams) =>
  boxesOf(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()))
const validateCarcaseParams = (p: CarcaseParams) =>
  validateOf(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()))

const CAMERA = { position: { x: 250, y: -200, z: 150 }, target: { x: 0, y: 0, z: 0 } }

const FIXTURE: ZimmuFile = {
  version: 1,
  name: 'Garden Shelf',
  appVersion: '0.0.0',
  units: 'mm',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  camera: CAMERA,
  scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
}

function makeInput(overrides?: Partial<Parameters<typeof useFile>[0]>) {
  return {
    scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
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
      grain: 'free' as const,
      material: '',
      color: '#aaa',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      {
        initialProps: {
          scene: {
            parts: [] as Scene['parts'],
            materials: {},
            hardware: [],
            joints: [],
            components: [],
          },
        },
      },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({
      scene: { parts: [mockPart], materials: {}, hardware: [], joints: [], components: [] },
    })
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
      grain: 'free' as const,
      material: '',
      color: '#aaa',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      {
        initialProps: {
          scene: {
            parts: [] as Scene['parts'],
            materials: {},
            hardware: [],
            joints: [],
            components: [],
          },
        },
      },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({
      scene: { parts: [mockPart], materials: {}, hardware: [], joints: [], components: [] },
    })
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
      grain: 'free' as const,
      material: '',
      color: '#aaa',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    }
    const { result } = renderHook(() =>
      useFile(
        makeInput({
          scene: { parts: [part], materials: {}, hardware: [], joints: [], components: [] },
        }),
      ),
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
  // BoardPart.grain is required, so an absent field would reach every read site as undefined.
  // Normalised once here, the way parentId and backSetback are.
  it('defaults grain to free on a file that predates the field', () => {
    const legacy = JSON.stringify({
      ...FIXTURE,
      version: 12,
      scene: {
        ...FIXTURE.scene,
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
          },
        ],
      },
    })
    const part = parseFile(legacy).scene.parts[0]
    expect(part.kind === 'board' && part.grain).toBe('free')
  })

  // The half a blanket `grain: 'free'` would silently break.
  it('keeps a grain the file already carries', () => {
    const withGrain = JSON.stringify({
      ...FIXTURE,
      scene: {
        ...FIXTURE.scene,
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Side',
            length: 560,
            width: 720,
            thickness: 18,
            grain: 'width',
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
          },
        ],
      },
    })
    const part = parseFile(withGrain).scene.parts[0]
    expect(part.kind === 'board' && part.grain).toBe('width')
  })

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

  // Save and reopen, not parse alone: the kind has to clear the unknown-kind filter *and* miss the
  // dado default, which would spread a groove's fields over a screw joint. Invisible on a driven
  // joint, which regeneration recreates; permanent on one the user overrode, which it will not.
  it('a screw joint survives save → parse', async () => {
    let writtenContent = ''
    const mockWritable = {
      write: vi.fn().mockImplementation((c: string) => {
        writtenContent = c
        return Promise.resolve()
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const mockHandle = {
      name: 'screwed.zimmu',
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    } as unknown as FileSystemFileHandle
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(mockHandle))

    const board = (id: string, label: string, length: number): BoardPart => ({
      kind: 'board',
      id,
      label,
      length,
      width: 560,
      thickness: 18,
      grain: 'length',
      material: '18mm Ply',
      color: '#c8a97e',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    })
    const side = board('b_side', 'Left Side', 720)
    const bottom = board('b_bottom', 'Bottom', 564)
    const joint = defaultScrewJoint(side, bottom, '+Z', '-X', 'j_screw', 'Screw fixing 1')

    const { result } = renderHook(() =>
      useFile(
        makeInput({
          scene: {
            parts: [side, bottom],
            materials: {},
            hardware: [],
            joints: [joint],
            components: [],
          },
        }),
      ),
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    await act(async () => {
      await result.current.saveFile()
    })

    expect(parseFile(writtenContent).scene.joints).toEqual([joint])
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
            parentId: null,
            driven: false,
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

    // The scene the app holds after File → New: the envelope newFile hands to onFileLoaded, seeded
    // with the materials a carcase preset names. Dirty is `live scene !== last saved`, so a mock
    // that stayed empty while newFile saved a seeded snapshot would read as dirty on a brand new
    // file.
    const { result } = renderHook(() =>
      useFile(
        makeInput({
          onFileLoaded,
          scene: {
            parts: [],
            materials: { ...PRESET_MATERIALS },
            hardware: [],
            joints: [],
            components: [],
          },
        }),
      ),
    )
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
            grain: 'free' as const,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            // no cuts field — simulates a pre-cuts file
          } as unknown as Part,
        ],
        materials: {},
        components: [],
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
            grain: 'free' as const,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            cuts: [],
            // no visible field — simulates a pre-visible file
          } as unknown as Part,
        ],
        materials: {},
        components: [],
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
            grain: 'free' as const,
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
        components: [],
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
            parentId: null,
            driven: false,
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
            parentId: null,
            driven: false,
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
            driven: false,
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
            driven: false,
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
            driven: false,
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
            grain: 'free' as const,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            cuts: [],
            material: '',
            visible: false,
            parentId: null,
            driven: false,
          },
        ],
        materials: {},
        components: [],
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

describe('v10 → v11 migration', () => {
  it('defaults components, parentId and driven on a v10 file', () => {
    const v10 = JSON.stringify({
      version: 10,
      name: 'Old',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
          },
        ],
        materials: {},
        hardware: [],
        joints: [
          {
            kind: 'halflap',
            id: 'j1',
            label: 'Half-lap 1',
            partAId: 'b1',
            partBId: 'b1',
            split: 0.5,
            clearance: 0,
          },
        ],
      },
    })

    const parsed = parseFile(v10)

    expect(parsed.scene.components).toEqual([])
    expect(parsed.scene.parts[0].parentId).toBeNull()
    expect(parsed.scene.parts[0].driven).toBe(false)
    expect(parsed.scene.joints[0].driven).toBe(false)
  })

  it('preserves an explicit v11 tree', () => {
    const v11 = JSON.stringify({
      version: 11,
      name: 'New',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            id: 'cmp_1',
            kind: 'carcase',
            label: 'Base Cabinet',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            visible: true,
          },
        ],
      },
    })

    expect(parseFile(v11).scene.components[0].label).toBe('Base Cabinet')
  })

  it('promotes a part whose parentId names a component that is not in the file', () => {
    const broken = JSON.stringify({
      version: 11,
      name: 'Broken',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Orphan',
            length: 200,
            width: 100,
            thickness: 25,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
            parentId: 'ghost',
            driven: false,
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
        components: [],
      },
    })

    const parsed = parseFile(broken)
    expect(parsed.scene.parts).toHaveLength(1)
    expect(parsed.scene.parts[0].parentId).toBeNull()
  })

  // The invariant this migration exists for: downstream transform code walks parentId chains
  // with `=== null` root checks, so an absent key reaching a Part is a placement bug, not a
  // cosmetic one. Asserted per-branch (board AND cylinder) and via own-property presence so
  // that deleting the default from either mapper branch fails here.
  it('leaves no part with an undefined parentId or driven after loading a v10 file', () => {
    const v10 = JSON.stringify({
      version: 10,
      name: 'Legacy',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [
          {
            kind: 'board',
            id: 'b1',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
          },
          {
            kind: 'cylinder',
            id: 'c1',
            label: 'Dowel 1',
            diameter: 8,
            length: 40,
            material: '',
            color: '#c8a97e',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            cuts: [],
            visible: true,
          },
        ],
        materials: {},
        hardware: [],
        joints: [],
      },
    })

    const parts = parseFile(v10).scene.parts
    expect(parts.map((p) => p.kind)).toEqual(['board', 'cylinder'])
    for (const part of parts) {
      const own = Object.prototype.hasOwnProperty.bind(part)
      expect(own('parentId')).toBe(true)
      expect(own('driven')).toBe(true)
      expect(part.parentId).not.toBe(undefined)
      expect(part.driven).not.toBe(undefined)
      expect(part.parentId).toBeNull()
      expect(part.driven).toBe(false)
    }
  })

  // Pre-existing gap: linkedPartIds/linkedComponentIds are read unguarded (.includes) in the UI
  // but were only ever seeded on new items, so a file predating them loaded an undefined array.
  // The per-item hardware map now defaults both; a non-empty item proves the map ran (not dropped).
  it('defaults linkedPartIds and linkedComponentIds on hardware that lacks them', () => {
    const legacy = JSON.stringify({
      version: 10,
      name: 'Legacy hardware',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Hinge',
            qty: 4,
            unit: 'pcs',
            supplier: 'Ace',
            partNumber: 'H-100',
            unitCost: 2.5,
            notes: 'soft-close',
          },
        ],
        joints: [],
      },
    })

    const hardware = parseFile(legacy).scene.hardware
    expect(hardware).toHaveLength(1)
    expect(hardware[0].name).toBe('Hinge')
    expect(hardware[0].linkedPartIds).toEqual([])
    expect(hardware[0].linkedComponentIds).toEqual([])
  })
})

describe('v11 loader repairs a structurally broken file', () => {
  const envelope = (components: unknown[]) =>
    JSON.stringify({
      version: 11,
      name: 'Broken',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: { parts: [], materials: {}, hardware: [], joints: [], components },
    })

  const cmp = (id: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({
    id,
    kind: 'group',
    label: id,
    parentId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    ...extra,
  })

  it('roots a component cycle rather than loading a scene that throws on render', () => {
    const parsed = parseFile(envelope([cmp('a', 'b'), cmp('b', 'a')]))
    expect(parsed.scene.components).toHaveLength(2)
    expect(parsed.scene.components.some((c) => c.parentId === null)).toBe(true)
  })

  it('demotes a carcase carrying no params to a group', () => {
    const parsed = parseFile(envelope([cmp('a', null, { kind: 'carcase' })]))
    expect(parsed.scene.components[0].kind).toBe('group')
  })

  it('keeps a carcase that does carry params', () => {
    const params = {
      width: 600,
      height: 720,
      depth: 560,
      material: '',
      thickness: 18,
      hasTop: true,
      backMode: 'captured',
      backThickness: 12,
      baseMode: 'none',
      toeKickHeight: 100,
      toeKickSetback: 60,
      fixedShelves: 1,
      adjustableShelves: { rows: 1, pitch: 32, setback: 37, startHeight: 200, count: 0 },
      jointMethod: 'dado-rabbet',
      dividers: [],
    }
    const parsed = parseFile(envelope([cmp('a', null, { kind: 'carcase', params })]))
    expect(parsed.scene.components[0].kind).toBe('carcase')
  })
})

// `backSetback` arrived with v12. A v11 carcase has a `setback` and nothing else to say where the
// back row goes, and the one place that gap may be filled is here — every read site downstream
// treats the field as present.
describe('v12 loader defaults a carcase back setback', () => {
  const shelves = { rows: 2, pitch: 32, setback: 50, startHeight: 200, count: 10 }
  const carcase = (adjustableShelves: Record<string, unknown>) =>
    JSON.stringify({
      version: 11,
      name: 'Legacy',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            id: 'cmp_1',
            kind: 'carcase',
            label: 'Base 600',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            visible: true,
            params: {
              width: 600,
              height: 720,
              depth: 560,
              material: '18mm Ply',
              thickness: 18,
              hasTop: true,
              backMode: 'captured',
              backThickness: 12,
              baseMode: 'toe-kick',
              toeKickHeight: 100,
              toeKickSetback: 60,
              fixedShelves: 1,
              adjustableShelves,
              jointMethod: 'dado-rabbet',
              dividers: [],
            },
          },
        ],
      },
    })

  // v16 moved the shelving off the cabinet and onto the openings, so the value the file states is
  // read back from a leaf. Any leaf: the migration seeds the same spec on every one, which is
  // exactly what the single cabinet-wide bundle meant.
  const shelvesOf = (text: string) => {
    const c = parseFile(text).scene.components[0]
    expect(c.kind).toBe('carcase')
    if (c.kind !== 'carcase') throw new Error('not a carcase')
    const interior = firstInterior(c.params.section)
    if (interior === undefined) throw new Error('no interior on any leaf')
    return interior.adjustable
  }

  // 50, not the preset's 37: a default hardcoded to the preset would pass against 37 and prove
  // nothing about reading the file's own value.
  it("defaults backSetback to the file's own setback", () => {
    expect(shelvesOf(carcase(shelves)).backSetback).toBe(50)
  })

  it('leaves a back setback the file already carries alone', () => {
    expect(shelvesOf(carcase({ ...shelves, backSetback: 12 })).backSetback).toBe(12)
  })
})

// `base.params` is typed loosely in useFile.ts, so `tsc` cannot see a file-format regression here.
// A v16 migration needs a parseFile test, not a green typecheck.
// `base.params` is typed loosely in useFile.ts, so `tsc` cannot see a file-format regression here.
// A v17 migration needs a parseFile test, not a green typecheck.
describe('v16 → v17 migration', () => {
  const v16 = (params: Record<string, unknown>) =>
    JSON.stringify({
      version: 16,
      scene: {
        parts: [],
        materials: { '18mm Ply': { thickness: 18 }, '12mm MDF': { thickness: 12 } },
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'carcase',
            id: 'cmp_1',
            label: 'Base',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            visible: true,
            params: {
              width: 600,
              height: 720,
              depth: 560,
              carcaseMaterial: '18mm Ply',
              backMaterial: '12mm MDF',
              hasTop: true,
              backMode: 'captured',
              baseMode: 'toe-kick',
              toeKickHeight: 100,
              toeKickSetback: 60,
              jointMethod: 'butt-screw',
              section: legacyToSection([], 0, 600, 18),
              ...params,
            },
          },
        ],
      },
    })

  const carcaseOf = (text: string) => {
    const c = parseFile(text).scene.components[0]
    if (c.kind !== 'carcase') throw new Error('not a carcase')
    return c.params
  }

  // A pre-v17 file states no front slot at all, and every read site downstream treats the three
  // fields as present — `carcaseBoxes` dereferences `frontMount` on every call.
  it('fills the three front fields a pre-v17 file cannot state', () => {
    const p = carcaseOf(v16({}))
    expect(p.frontMaterial).toBe('18mm Ply')
    expect(p.frontMount).toBe('overlay')
    expect(p.frontReveal).toBe(3)
  })

  // A file that has no fronts must not gain any: a door appearing in someone's saved cabinet is a
  // change to what they drew, not a migration.
  it('invents no fronts', () => {
    const p = carcaseOf(v16({}))
    const boxes = boxesOf(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()))
    expect(boxes.filter((b) => b.role.startsWith('front-'))).toEqual([])
  })

  // v17 also widened `InteriorSpec`. A migrated interior missing `fixedShelves` compiles — the
  // parser types `base.params` loosely — and only fails when the generator dereferences it, which
  // is the exact regression CLAUDE.md says a parseFile test is required to catch.
  it('gives a migrated interior no fixed shelves', () => {
    const p = carcaseOf(
      v16({
        section: seedInteriors(legacyToSection([], 1, 600, 18), {
          fixedShelves: 0,
          adjustable: { shelves: 0, count: 10, rows: 2, pitch: 32, setback: 37, backSetback: 37 },
        }),
      }),
    )
    const leaves = (s: Section): Section[] =>
      s.content.kind === 'leaf' ? [s] : s.content.children.flatMap(leaves)
    const all = leaves(p.section)
    expect(all.length).toBeGreaterThan(0)
    for (const leaf of all) expect(leaf.interior?.fixedShelves).toBe(0)
  })

  it('leaves the three fields alone when the file already states them', () => {
    const p = carcaseOf(v16({ frontMaterial: '12mm MDF', frontMount: 'inset', frontReveal: 2 }))
    expect(p.frontMaterial).toBe('12mm MDF')
    expect(p.frontMount).toBe('inset')
    expect(p.frontReveal).toBe(2)
  })
})

describe('v15 → v16 migration', () => {
  const shelves = { rows: 2, pitch: 32, setback: 50, backSetback: 44, startHeight: 200, count: 10 }
  const v15 = (params: Record<string, unknown>) =>
    JSON.stringify({
      version: 15,
      scene: {
        parts: [],
        materials: { '18mm Ply': { thickness: 18 }, '12mm MDF': { thickness: 12 } },
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'carcase',
            id: 'cmp_1',
            label: 'Base',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            visible: true,
            params: {
              width: 600,
              height: 720,
              depth: 560,
              carcaseMaterial: '18mm Ply',
              backMaterial: '12mm MDF',
              hasTop: true,
              backMode: 'captured',
              baseMode: 'toe-kick',
              toeKickHeight: 100,
              toeKickSetback: 60,
              jointMethod: 'dado-rabbet',
              ...params,
            },
          },
        ],
      },
    })

  // Two bays with a fixed shelf each: four leaves, so "seeded on every one" is a claim with
  // something to be wrong about.
  const divided = legacyToSection([0.5], 1, 600, 18)

  const carcaseOf = (text: string) => {
    const c = parseFile(text).scene.components[0]
    if (c.kind !== 'carcase') throw new Error('not a carcase')
    return c
  }

  const leaves = (s: Section): Section[] =>
    s.content.kind === 'leaf' ? [s] : s.content.children.flatMap(leaves)

  it('puts the cabinet-wide bundle on every leaf', () => {
    const params = carcaseOf(v15({ section: divided, adjustableShelves: shelves })).params
    const all = leaves(params.section)
    expect(all).toHaveLength(4)
    for (const leaf of all) {
      expect(leaf.interior?.adjustable).toEqual({
        shelves: 0,
        count: 10,
        rows: 2,
        pitch: 32,
        setback: 50,
        backSetback: 44,
      })
    }
  })

  // A pre-v16 file had no shelf boards. Seeding any would put parts in the user's cutting list
  // that they never drew.
  it('invents no shelf boards', () => {
    const params = carcaseOf(v15({ section: divided, adjustableShelves: shelves })).params
    for (const leaf of leaves(params.section)) expect(leaf.interior?.adjustable.shelves).toBe(0)
  })

  // `startHeight` has no successor: a row starts above its own section's floor now. It must not
  // survive as a field nothing reads, which is how a stale parameter outlives its meaning.
  it('drops startHeight and the cabinet-wide bundle', () => {
    const params: CarcaseParams & { adjustableShelves?: unknown } = carcaseOf(
      v15({ section: divided, adjustableShelves: shelves }),
    ).params
    expect(params.adjustableShelves).toBeUndefined()
    expect(JSON.stringify(params)).not.toContain('startHeight')
  })

  it('leaves a carcase that never stated any shelving without an interior', () => {
    const params = carcaseOf(v15({ section: divided })).params
    for (const leaf of leaves(params.section)) expect(leaf.interior).toBeUndefined()
  })
})

describe('v12 → v13 migration', () => {
  const v12 = (params: Record<string, unknown>) =>
    JSON.stringify({
      version: 12,
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'carcase',
            id: 'cmp_1',
            label: 'Base',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            visible: true,
            params,
          },
        ],
      },
    })

  const BASE = {
    width: 600,
    height: 720,
    depth: 560,
    material: '18mm Ply',
    thickness: 18,
    hasTop: true,
    backMode: 'captured',
    backThickness: 12,
    baseMode: 'toe-kick',
    toeKickHeight: 100,
    toeKickSetback: 60,
    jointMethod: 'dado-rabbet',
    adjustableShelves: {
      rows: 2,
      pitch: 32,
      setback: 37,
      backSetback: 37,
      startHeight: 200,
      count: 10,
    },
  }

  const carcaseOf = (text: string) => {
    const c = parseFile(text).scene.components[0]
    if (c.kind !== 'carcase') throw new Error('expected a carcase')
    return c
  }

  it('turns dividers and fixedShelves into a tree', () => {
    const c = carcaseOf(v12({ ...BASE, dividers: [0.5], fixedShelves: 1 }))
    expect(c.params.section.content.kind).toBe('split')
    expect('dividers' in c.params).toBe(false)
    expect('fixedShelves' in c.params).toBe(false)
  })

  it('a plain v12 cabinet becomes a single leaf', () => {
    expect(
      carcaseOf(v12({ ...BASE, dividers: [], fixedShelves: 0 })).params.section.content.kind,
    ).toBe('leaf')
  })

  it('produces the same cabinet the v12 parameters described', () => {
    const c = carcaseOf(v12({ ...BASE, dividers: [0.5], fixedShelves: 1 }))
    const divisions = carcaseBoxes(c.params).filter((b) => b.role.startsWith('division-'))
    // One partition, plus one shelf in each of the two bays.
    expect(divisions.filter((d) => d.thicknessAxis === 'x')).toHaveLength(1)
    expect(divisions.filter((d) => d.thicknessAxis === 'z')).toHaveLength(2)
  })

  // The regression this group exists to close: before the migration existed, a v12 carcase reached
  // the generator with `section` undefined and threw on `s.id`.
  it('a migrated v12 carcase validates instead of throwing', () => {
    const c = carcaseOf(v12({ ...BASE, dividers: [0.5], fixedShelves: 1 }))
    expect(validateCarcaseParams(c.params)).toEqual([])
  })

  // The partition must land where v12 put it, not where an even split would. This is the exact
  // discrepancy the golden-master baseline caught, so it is pinned here at the file boundary too.
  it('places the partition on its v12 centre, not on an even share', () => {
    const c = carcaseOf(v12({ ...BASE, width: 1400, dividers: [1 / 3, 2 / 3], fixedShelves: 0 }))
    const partitions = carcaseBoxes(c.params)
      .filter((b) => b.role.startsWith('division-') && b.thicknessAxis === 'x')
      .sort((a, b) => a.box.x0 - b.box.x0)
    expect(partitions).toHaveLength(2)
    // v12: a divider is centred on W*d, so x0 = 1400/3 - 18/2 = 457.667
    expect(partitions[0].box.x0).toBeCloseTo(1400 / 3 - 9, 6)
    expect(partitions[1].box.x0).toBeCloseTo((1400 * 2) / 3 - 9, 6)
  })
})

// v13 states one thickness per carcase, v14 one thickness per material. Two carcases may legally
// share a material name at different thicknesses in v13 and cannot in v14, so the migration has to
// tell them apart — reusing one definition would resize one of the two cabinets.
describe('v13 → v14 migration', () => {
  const params = (extra: Record<string, unknown>) => ({
    width: 600,
    height: 720,
    depth: 560,
    hasTop: true,
    backMode: 'captured',
    baseMode: 'toe-kick',
    toeKickHeight: 100,
    toeKickSetback: 60,
    jointMethod: 'dado-rabbet',
    section: { id: 'sec_1', size: { kind: 'equal' }, content: { kind: 'leaf' } },
    adjustableShelves: {
      rows: 2,
      pitch: 32,
      setback: 37,
      backSetback: 37,
      startHeight: 200,
      count: 10,
    },
    ...extra,
  })

  const file = (
    carcases: Record<string, unknown>[],
    materials: Record<string, unknown> = {},
    version = 13,
  ) =>
    JSON.stringify({
      version,
      name: 'Kitchen',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: CAMERA,
      scene: {
        parts: [],
        materials,
        hardware: [],
        joints: [],
        components: carcases.map((p, i) => ({
          kind: 'carcase',
          id: `cmp_${i + 1}`,
          label: `Cabinet ${i + 1}`,
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          params: p,
        })),
      },
    })

  const loaded = (text: string) => {
    const parsed = parseFile(text)
    return {
      materials: parsed.scene.materials,
      carcases: parsed.scene.components.map((c) => {
        if (c.kind !== 'carcase') throw new Error('expected a carcase')
        return c.params
      }),
    }
  }

  const resolve = (materials: Record<string, MaterialDef>, p: CarcaseParams, role: string) =>
    roleThicknessFor(p, materials, new Map())(role)

  const SHARED = [
    params({ material: '18mm Ply', thickness: 18, backThickness: 12 }),
    params({ material: '18mm Ply', thickness: 25, backThickness: 12 }),
  ]

  // The hazard this whole migration exists for.
  it('keeps each carcase at the thickness it was saved with when a name collides', () => {
    const { materials, carcases } = loaded(file(SHARED))
    expect(resolve(materials, carcases[0], 'left-side')).toBe(18)
    expect(resolve(materials, carcases[1], 'left-side')).toBe(25)
  })

  it('disambiguates the colliding name by its thickness', () => {
    const { materials, carcases } = loaded(file(SHARED))
    expect(carcases[0].carcaseMaterial).toBe('18mm Ply')
    expect(carcases[1].carcaseMaterial).toBe('18mm Ply (25mm)')
    expect(materials['18mm Ply'].thickness).toBe(18)
    expect(materials['18mm Ply (25mm)'].thickness).toBe(25)
  })

  it('both migrated carcases validate', () => {
    const { materials, carcases } = loaded(file(SHARED))
    for (const p of carcases) {
      expect(validateOf(p, roleThicknessFor(p, materials, new Map()))).toEqual([])
    }
  })

  // The other half of the rule: only a *differing* thickness may fork the name.
  it('shares one definition between two carcases of the same thickness', () => {
    const { materials, carcases } = loaded(
      file([
        params({ material: '18mm Ply', thickness: 18, backThickness: 12 }),
        params({ material: '18mm Ply', thickness: 18, backThickness: 12 }),
      ]),
    )
    expect(carcases[0].carcaseMaterial).toBe('18mm Ply')
    expect(carcases[1].carcaseMaterial).toBe('18mm Ply')
    expect(Object.keys(materials).filter((n) => n.startsWith('18mm Ply'))).toEqual(['18mm Ply'])
  })

  it('drops the per-carcase thickness fields', () => {
    const { carcases } = loaded(file(SHARED))
    for (const p of carcases) {
      expect('material' in p).toBe(false)
      expect('thickness' in p).toBe(false)
      expect('backThickness' in p).toBe(false)
    }
  })

  // Adding a thickness, not replacing the definition: a rate the user typed must survive the load.
  it('keeps the other fields of a material the file already defines', () => {
    const { materials } = loaded(
      file([params({ material: '18mm Ply', thickness: 18, backThickness: 12 })], {
        '18mm Ply': { costPerM2: 42, hasGrain: true, sheet: { length: 2440, width: 1220 } },
      }),
    )
    expect(materials['18mm Ply']).toEqual({
      costPerM2: 42,
      hasGrain: true,
      sheet: { length: 2440, width: 1220 },
      thickness: 18,
    })
  })

  // v13 has a back thickness and no back material name at all, so one is synthesised per distinct
  // thickness — named for the thickness it stands for, so a 6 mm back is not called "12mm MDF".
  it('synthesises a back material per distinct back thickness', () => {
    const { materials, carcases } = loaded(
      file([
        params({ material: '18mm Ply', thickness: 18, backThickness: 12 }),
        params({ material: '18mm Ply', thickness: 18, backThickness: 6 }),
      ]),
    )
    expect(carcases[0].backMaterial).toBe('12mm MDF')
    expect(carcases[1].backMaterial).toBe('6mm MDF')
    expect(resolve(materials, carcases[0], 'back')).toBe(12)
    expect(resolve(materials, carcases[1], 'back')).toBe(6)
  })

  // Some legacy carcases carry `material: ''`. Deriving the name from the thickness rather than
  // synthesising one called "" keeps a nameless row out of every list the materials record feeds.
  it('names a slot the file left blank after its thickness', () => {
    const { materials, carcases } = loaded(
      file([params({ material: '', thickness: 18, backThickness: 12 })]),
    )
    expect(carcases[0].carcaseMaterial).toBe('18mm Ply')
    expect('' in materials).toBe(false)
    expect(resolve(materials, carcases[0], 'left-side')).toBe(18)
  })

  // A v14 file states its slots and its thicknesses already; the migration must not touch it.
  it('passes a v14 file through unchanged and idempotently', () => {
    const v14 = file(
      [params({ carcaseMaterial: '18mm Ply', backMaterial: '12mm MDF' })],
      { '18mm Ply': { thickness: 18 }, '12mm MDF': { thickness: 12 }, Dowel: { costPerM: 3 } },
      14,
    )
    const once = parseFile(v14).scene
    expect(once.materials).toEqual({
      '18mm Ply': { thickness: 18 },
      '12mm MDF': { thickness: 12 },
      Dowel: { costPerM: 3 },
    })
    const twice = parseFile(JSON.stringify({ ...JSON.parse(v14), scene: once })).scene
    expect(twice).toEqual(once)
  })
})

// `useFile` types `base.params` loosely, so `tsc` cannot see a parser that drops a required field:
// the failure appears only when the generator dereferences it at runtime. Hence a `parseFile` test.
describe('v17 → v18: drawer components', () => {
  const envelope = (components: unknown[]) =>
    JSON.stringify({
      version: 18,
      name: 'Drawers',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: CAMERA,
      scene: { parts: [], materials: {}, hardware: [], joints: [], components },
    })

  const drawer = (extra: Record<string, unknown> = {}) => ({
    kind: 'drawer',
    id: 'cmp_d1',
    label: 'Drawer 1',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    sectionId: 'sec_abc',
    driven: true,
    params: { family: 'undermount', boxHeight: 120, runnerOffset: 32, material: 'Ply 15' },
    ...extra,
  })

  // Not `const { params, ...rest } = drawer()`: this repo's `no-unused-vars` sets only
  // `argsIgnorePattern`, so neither a bare rest sibling nor a `_`-prefixed one is ignored and both
  // are lint errors. Naming the absent field is also what these tests are about.
  const without = (key: 'params' | 'sectionId' | 'driven') => {
    const c: Record<string, unknown> = drawer()
    delete c[key]
    return c
  }

  it('parses a drawer component with its params intact', () => {
    const c = parseFile(envelope([drawer()])).scene.components[0]
    expect(c.kind).toBe('drawer')
    expect(c).toMatchObject({
      sectionId: 'sec_abc',
      driven: true,
      params: { family: 'undermount', boxHeight: 120, runnerOffset: 32, material: 'Ply 15' },
    })
  })

  // A drawer whose params did not survive the round trip is the exact failure tsc cannot see.
  it('round-trips a drawer through parse and re-parse', () => {
    const once = parseFile(
      envelope([
        drawer({
          params: { family: 'side-mount', boxHeight: null, runnerOffset: 32, material: '' },
        }),
      ]),
    )
    const twice = parseFile(JSON.stringify(once))
    expect(twice.scene.components[0]).toEqual(once.scene.components[0])
    expect(twice.scene.components[0]).toMatchObject({
      kind: 'drawer',
      params: { family: 'side-mount', boxHeight: null },
    })
  })

  // The one field the parser does not fabricate in the generator's favour. A driven drawer whose
  // opening no longer wants one is dropped, boards and all, so recovering the flag as `true` would
  // let a malformed file delete work. Every other `driven` default here reads the same way.
  it('leaves a drawer that does not state driven detached', () => {
    const c = parseFile(envelope([without('driven')])).scene.components[0]
    expect(c).toMatchObject({ kind: 'drawer', driven: false })
  })

  it('demotes a drawer carrying no params to a group', () => {
    const c = parseFile(envelope([without('params')])).scene.components[0]
    expect(c.kind).toBe('group')
    expect(c).toMatchObject({ id: 'cmp_d1', label: 'Drawer 1', visible: true })
  })

  it('demotes a drawer naming no section to a group', () => {
    const c = parseFile(envelope([without('sectionId')])).scene.components[0]
    expect(c.kind).toBe('group')
  })

  // A released drawer — detached, and its opening gone — states `sectionId: null`, which the model
  // allows and the demotion guard must let through. Absent and null are a millimetre apart in the
  // parser and a whole component kind apart in the scene: written as `== null` the guard would
  // demote every released drawer in every saved file to a group on load.
  it('parses a drawer whose section id is released as a drawer', () => {
    const c = parseFile(envelope([drawer({ sectionId: null, driven: false })])).scene.components[0]
    expect(c.kind).toBe('drawer')
    expect(c).toMatchObject({ id: 'cmp_d1', sectionId: null, driven: false })
  })

  // The version bump's one observable consequence: a v18 file is no longer from the future. The
  // assertion is that a well-formed current-version file parses *silently*, not that one particular
  // sentence went unsaid: matching the warning's wording makes the bump's only pin co-dependent on
  // a log string, and rewording it while reverting the constant left the whole suite green.
  it('reads a v18 file without warning at all', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseFile(envelope([drawer()]))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

})

describe('v19 anchors', () => {
  const PARAMS = {
    width: 600,
    height: 720,
    depth: 560,
    carcaseMaterial: 'Ply18',
    backMaterial: 'Ply18',
    frontMaterial: 'Ply18',
    hasTop: true,
    backMode: 'captured',
    baseMode: 'none',
    toeKickHeight: 100,
    toeKickSetback: 50,
    frontMount: 'overlay',
    frontReveal: 3,
    section: { id: 'sec_1', size: { kind: 'equal' }, content: { kind: 'leaf' } },
    jointMethod: 'butt-screw',
  }

  const carcase = (id: string, anchor?: unknown) => ({
    kind: 'carcase',
    id,
    label: id,
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: PARAMS,
    ...(anchor === undefined ? {} : { anchor }),
  })

  const fileWith = (version: number, components: unknown[]) =>
    JSON.stringify({
      version,
      scene: { parts: [], materials: {}, hardware: [], joints: [], components },
    })

  const anchorOf = (text: string, id: string) => {
    const c = parseFile(text).scene.components.find((x) => x.id === id)
    return c?.kind === 'carcase' ? c.anchor : 'not-a-carcase'
  }

  // The stamp, not the gate, and deliberately a value pin: `buildEnvelope` writes this constant into
  // every saved file, and that number is read by an app this one cannot run the suite of. Left at 18,
  // an anchor-bearing file reads as current to a build with no placement pass, and every anchor
  // passes through unrecognised with nothing said — a consequence no test here can observe, which is
  // why the constant itself is asserted. This pin replaces the v18 one: the constant is global, so
  // only the newest value can be asserted.
  it('states the current file format version', () => {
    expect(FILE_FORMAT_VERSION).toBe(19)
  })

  it('round-trips an anchor through parseFile', () => {
    const text = fileWith(19, [
      carcase('cmp_a'),
      carcase('cmp_b', { to: 'cmp_a', face: 'right', gap: 3, offset: { u: 10, v: 20 } }),
    ])
    expect(anchorOf(text, 'cmp_b')).toEqual({
      to: 'cmp_a',
      face: 'right',
      gap: 3,
      offset: { u: 10, v: 20 },
    })
  })

  // A v18 file has no anchors at all and must load with every cabinet free-placed, rather than
  // failing or acquiring a default.
  it('loads a v18 file with every cabinet free-placed', () => {
    expect(anchorOf(fileWith(18, [carcase('cmp_a')]), 'cmp_a')).toBeUndefined()
  })
})
