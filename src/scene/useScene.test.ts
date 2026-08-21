import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type {
  BoardPart,
  BoxCut,
  CutDef,
  CylinderPart,
  DadoJoint,
  FingerJoint,
  TongueGrooveJoint,
  HalfLapJoint,
  MortiseTenonJoint,
  FaceHit,
  Part,
  PartId,
  Scene,
  ZimmuFile,
} from './types'

function asBoard(p: Part): BoardPart {
  if (p.kind !== 'board') throw new Error('expected board part')
  return p
}

const mockBuildPart = vi.fn()
const mockExportStep = vi.fn()

vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart, buildBox: vi.fn(), exportStep: mockExportStep }),
  expose: vi.fn(),
  transfer: vi.fn((data: unknown) => data),
}))

vi.stubGlobal(
  'Worker',
  vi.fn(function MockWorker() {}),
)

import { useScene, buildSpecForPart } from './useScene'
import { resolveWorldMatrix } from '../geom/transform'
import { componentsById } from './componentTree'
import { CARCASE_PRESETS } from './carcasePresets'
import { carcaseRoles } from './carcaseRoles'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'

describe('useScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  it('starts with one default board labelled "Board 1"', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.scene.parts[0].label).toBe('Board 1')
    expect(result.current.scene.parts[0].kind).toBe('board')
  })

  it('starts with occtReady false', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.occtReady).toBe(false)
  })

  it('sets occtReady true after first buildPart resolves', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
  })

  it('onAdd is a no-op when occtReady is false', () => {
    const { result } = renderHook(() => useScene())
    act(() => {
      result.current.onAdd('board')
    })
    expect(result.current.scene.parts).toHaveLength(1)
  })

  it('onAdd appends a new board when occtReady is true', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd('board')
    })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].label).toBe('Board 2')
  })

  it('onAdd auto-selects the new part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd('board')
    })
    const newId = result.current.scene.parts[1].id
    expect(result.current.selectedId).toBe(newId)
  })

  it('onRemove removes the part and clears selectedId when matched', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd('board')
    })
    const id = result.current.scene.parts[1].id
    act(() => {
      result.current.onRemove(id)
    })
    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.selectedId).toBeNull()
  })

  it('onUpdate replaces the matching part', () => {
    const { result } = renderHook(() => useScene())
    const original = result.current.scene.parts[0]
    act(() => {
      result.current.onUpdate(original.id, (p) => ({ ...p, label: 'Updated' }))
    })
    expect(result.current.scene.parts[0].label).toBe('Updated')
  })

  it('onDuplicate appends a clone after the original', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onDuplicate(id)
    })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].id).not.toBe(id)
  })

  it('onDuplicate resets rotation to zero', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const original = result.current.scene.parts[0]
    act(() => {
      result.current.onUpdate(original.id, (p) => ({ ...p, rotation: { x: 45, y: 0, z: 0 } }))
    })
    act(() => {
      result.current.onDuplicate(original.id)
    })
    expect(result.current.scene.parts[1].rotation).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('onDuplicate selects the clone', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const origId = result.current.scene.parts[0].id
    act(() => {
      result.current.onDuplicate(origId)
    })
    const cloneId = result.current.scene.parts[1].id
    expect(result.current.selectedId).toBe(cloneId)
  })

  it('undo after onDuplicate restores selection to original', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const origId = result.current.scene.parts[0].id
    act(() => {
      result.current.onDuplicate(origId)
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.selectedId).toBe(origId)
  })

  it('onToggleVisible hides a visible part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    expect(result.current.scene.parts[0].visible).toBe(false)
  })

  it('onToggleVisible twice restores visibility', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    act(() => {
      result.current.onToggleVisible(id)
    })
    expect(result.current.scene.parts[0].visible).toBe(true)
  })

  it('undo after onToggleVisible restores original visibility', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    expect(result.current.scene.parts[0].visible).toBe(false)
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.parts[0].visible).toBe(true)
  })

  it('redo after onToggleVisible re-hides the part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.parts[0].visible).toBe(true)
    act(() => {
      result.current.redo()
    })
    expect(result.current.scene.parts[0].visible).toBe(false)
  })

  it('onToggleVisible with unknown id is a no-op', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const before = result.current.scene.parts[0].visible
    act(() => {
      result.current.onToggleVisible('nonexistent_id' as PartId)
    })
    expect(result.current.scene.parts[0].visible).toBe(before)
  })

  it('nextLabel increments with each add', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    expect(result.current.nextLabel).toBe('Board 2')
    act(() => {
      result.current.onAdd('board')
    })
    expect(result.current.nextLabel).toBe('Board 3')
  })

  it('replaceScene replaces parts, clears selectedId, resets labelCounter', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd('board')
    })
    act(() => {
      result.current.onSelect({ kind: 'part', id: result.current.scene.parts[1].id })
    })

    const replacement = {
      parts: [
        {
          kind: 'board' as const,
          id: 'board_test',
          label: 'Board 5',
          length: 300,
          width: 150,
          thickness: 30,
          material: '',
          color: '#d4a373',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ' as const,
          cuts: [],
          visible: true,
          parentId: null,
          driven: false,
        },
      ],
      materials: {},
      components: [],
      hardware: [],
      joints: [],
    }
    act(() => {
      result.current.replaceScene(replacement)
    })

    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.scene.parts[0].id).toBe('board_test')
    expect(result.current.selectedId).toBeNull()
    expect(result.current.nextLabel).toBe('Board 6')
  })

  it('replaceScene with empty parts resets labelCounter to 1', () => {
    const { result } = renderHook(() => useScene())
    act(() => {
      result.current.replaceScene({
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [],
      })
    })
    expect(result.current.scene.parts).toHaveLength(0)
    expect(result.current.nextLabel).toBe('Board 1')
  })

  describe('undo/redo', () => {
    it('starts with canUndo false, canRedo false, labels null', () => {
      const { result } = renderHook(() => useScene())
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
      expect(result.current.undoLabel).toBeNull()
      expect(result.current.redoLabel).toBeNull()
    })

    it('after onAdd: canUndo true, undoLabel "Add Board 2", canRedo false', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.undoLabel).toBe('Add Board 2')
      expect(result.current.canRedo).toBe(false)
    })

    it('undo after onAdd removes the added part', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      expect(result.current.scene.parts).toHaveLength(2)
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts).toHaveLength(1)
    })

    it('undo after onAdd clears selectedId if it pointed to the removed part', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      const addedId = result.current.scene.parts[1].id
      expect(result.current.selectedId).toBe(addedId)
      act(() => {
        result.current.undo()
      })
      expect(result.current.selectedId).toBeNull()
    })

    it('redo after undo re-adds the part with the same id', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      const addedId = result.current.scene.parts[1].id
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts).toHaveLength(1)
      act(() => {
        result.current.redo()
      })
      expect(result.current.scene.parts).toHaveLength(2)
      expect(result.current.scene.parts[1].id).toBe(addedId)
    })

    it('after undo: canUndo false, canRedo true, redoLabel "Add Board 2"', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(true)
      expect(result.current.redoLabel).toBe('Add Board 2')
    })

    it('after onRemove: canUndo true, undoLabel "Remove Board 1"', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      act(() => {
        result.current.onRemove(id)
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.undoLabel).toBe('Remove Board 1')
    })

    it('undo after onRemove reinserts part at its original index', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      }) // adds Board 2 at index 1
      const firstId = result.current.scene.parts[0].id
      act(() => {
        result.current.onRemove(firstId)
      }) // removes index-0 part
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts).toHaveLength(2)
      expect(result.current.scene.parts[0].id).toBe(firstId)
    })

    it('redo after remove-undo removes the part again', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      const id = result.current.scene.parts[0].id
      act(() => {
        result.current.onRemove(id)
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts).toHaveLength(1)
      act(() => {
        result.current.redo()
      })
      expect(result.current.scene.parts).toHaveLength(0)
    })

    it('after onDuplicate: canUndo true, undoLabel "Duplicate Board 1"', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      const id = result.current.scene.parts[0].id
      act(() => {
        result.current.onDuplicate(id)
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.undoLabel).toBe('Duplicate Board 1')
    })

    it('undo after onDuplicate removes the clone, leaves original', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      const origId = result.current.scene.parts[0].id
      act(() => {
        result.current.onDuplicate(origId)
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts).toHaveLength(1)
      expect(result.current.scene.parts[0].id).toBe(origId)
    })

    it('redo after duplicate-undo reinserts clone at idx+1', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      const origId = result.current.scene.parts[0].id
      act(() => {
        result.current.onDuplicate(origId)
      })
      const cloneId = result.current.scene.parts[1].id
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts).toHaveLength(1)
      act(() => {
        result.current.redo()
      })
      expect(result.current.scene.parts).toHaveLength(2)
      expect(result.current.scene.parts[1].id).toBe(cloneId)
      expect(result.current.selectedId).toBe(cloneId)
    })

    it('after onUpdate: canUndo true, undoLabel "Update Board 1"', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 300 }))
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.undoLabel).toBe('Update Board 1')
    })

    it('undo after onUpdate restores the previous length', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      const originalLength = result.current.scene.parts[0].length
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 300 }))
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].length).toBe(originalLength)
    })

    it('redo after update-undo re-applies the update', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      const originalLength = result.current.scene.parts[0].length
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 300 }))
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].length).toBe(originalLength)
      act(() => {
        result.current.redo()
      })
      expect(result.current.scene.parts[0].length).toBe(300)
    })

    it('two consecutive onUpdate on same part produce one undo step', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 300 }))
      })
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 400 }))
      })
      expect(result.current.canUndo).toBe(true)
      act(() => {
        result.current.undo()
      })
      expect(result.current.canUndo).toBe(false)
    })

    it('coalesced undo restores to value before the first edit', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      const originalLength = result.current.scene.parts[0].length
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 300 }))
      })
      act(() => {
        result.current.onUpdate(id, (p) => ({ ...p, length: 400 }))
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].length).toBe(originalLength)
    })

    it('onUpdate on different parts creates two separate undo steps', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      const id0 = result.current.scene.parts[0].id
      const id1 = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(id0, (p) => ({ ...p, length: 300 }))
      })
      act(() => {
        result.current.onUpdate(id1, (p) => ({ ...p, length: 400 }))
      })
      act(() => {
        result.current.undo()
      }) // undoes id1 update
      expect(result.current.canUndo).toBe(true) // id0 update still in history
      expect(result.current.scene.parts[1].length).toBe(200) // id1 restored
      expect(result.current.scene.parts[0].length).toBe(300) // id0 still updated
    })

    it('history is capped at 50: 51st add is not undoable', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      for (let i = 0; i < 51; i++) {
        act(() => {
          result.current.onAdd('board')
        })
      }
      for (let i = 0; i < 50; i++) {
        act(() => {
          result.current.undo()
        })
      }
      expect(result.current.canUndo).toBe(false)
      // 2 parts remain: original Board 1 + first-added Board 2 (evicted from history)
      expect(result.current.scene.parts).toHaveLength(2)
    })

    it('replaceScene clears canUndo and canRedo', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      expect(result.current.canUndo).toBe(true)
      act(() => {
        result.current.replaceScene({
          parts: [],
          materials: {},
          hardware: [],
          joints: [],
          components: [],
        })
      })
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })

    it('undo after replaceScene is a no-op and does not throw', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      act(() => {
        result.current.replaceScene({
          parts: [],
          materials: {},
          hardware: [],
          joints: [],
          components: [],
        })
      })
      expect(() => {
        act(() => {
          result.current.undo()
        })
      }).not.toThrow()
      expect(result.current.scene.parts).toHaveLength(0)
    })

    it('onUpdate with historyLabel suppresses coalescing — two undos required', () => {
      const { result } = renderHook(() => useScene())
      const id = result.current.scene.parts[0].id
      const pos0 = result.current.scene.parts[0].position.z

      act(() => {
        result.current.onUpdate(
          id,
          (p) => ({ ...p, position: { ...p.position, z: 50 } }),
          'Snap A to B',
        )
      })
      const pos1 = result.current.scene.parts[0].position.z // 50

      act(() => {
        result.current.onUpdate(
          id,
          (p) => ({ ...p, position: { ...p.position, z: 100 } }),
          'Snap A to B',
        )
      })

      // Without historyLabel these two would coalesce into one undo step.
      // With historyLabel each is a discrete entry.
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].position.z).toBe(pos1) // intermediate

      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].position.z).toBe(pos0) // original (0)
    })

    it('after onAdd then undo, next onAdd creates Board 2 not Board 3', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.nextLabel).toBe('Board 2')
      act(() => {
        result.current.onAdd('board')
      })
      expect(result.current.scene.parts[1].label).toBe('Board 2')
    })
  })

  it('passes cuts array to buildPart when geometry is triggered', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    mockBuildPart.mockClear()

    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onUpdate(
        id,
        (p) =>
          ({
            ...p,
            cuts: [
              {
                id: 'cut_1',
                label: 'Cut 1',
                kind: 'box' as const,
                face: '+Z' as const,
                position: { x: 90, y: 40, z: 15 },
                size: { x: 20, y: 20, z: 10 },
              },
            ],
          }) as Part,
      )
    })

    await waitFor(() =>
      expect(mockBuildPart).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'board',
          cuts: [
            {
              id: 'cut_1',
              label: 'Cut 1',
              kind: 'box',
              face: '+Z',
              position: { x: 90, y: 40, z: 15 },
              size: { x: 20, y: 20, z: 10 },
            },
          ],
        }),
      ),
    )
  })

  describe('onUpdateCut', () => {
    const cut1: CutDef = {
      id: 'cut_1',
      label: 'Cut 1',
      kind: 'box',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }

    it('updates the matching cut', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(partId, (p) => ({ ...p, cuts: [cut1] }) as Part)
      })
      act(() => {
        result.current.onUpdateCut(partId, 'cut_1', (c) => ({
          ...(c as BoxCut),
          size: { ...(c as BoxCut).size, x: 30 },
        }))
      })
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).size.x).toBe(30)
    })

    it('creates an undoable entry (single undo restores)', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(partId, (p) => ({ ...p, cuts: [cut1] }) as Part)
      })
      act(() => {
        result.current.onUpdateCut(partId, 'cut_1', (c) => ({
          ...(c as BoxCut),
          size: { ...(c as BoxCut).size, x: 30 },
        }))
      })
      act(() => {
        result.current.undo()
      })
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).size.x).toBe(20)
    })

    it('propagates u/v sizes to paired cut; single undo restores both', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      const cutA: CutDef = {
        id: 'cut_a',
        label: 'Mortise',
        kind: 'box',
        face: '+Z',
        position: { x: 90, y: 40, z: 15 },
        size: { x: 30, y: 50, z: 10 },
        pairedCutId: `${partBId}:cut_b`,
      }
      const cutB: CutDef = {
        id: 'cut_b',
        label: 'Tenon',
        kind: 'box',
        face: '+Z',
        position: { x: 0, y: 0, z: 15 },
        size: { x: 30, y: 50, z: 10 },
        pairedCutId: `${partAId}:cut_a`,
      }

      act(() => {
        result.current.onUpdate(partAId, (p) => ({ ...p, cuts: [cutA] }) as Part)
        result.current.onUpdate(partBId, (p) => ({ ...p, cuts: [cutB] }) as Part)
      })

      // Update cut A's u-axis size (x for +Z face: axes.u='x')
      act(() => {
        result.current.onUpdateCut(partAId, 'cut_a', (c) => ({
          ...(c as BoxCut),
          size: { ...(c as BoxCut).size, x: 40 },
        }))
      })

      // cut A updated
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).size.x).toBe(40)
      // cut B's u-axis (also x, both are +Z face) updated by propagation
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).size.x).toBe(40)

      // single undo restores both
      act(() => {
        result.current.undo()
      })
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).size.x).toBe(30)
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).size.x).toBe(30)
    })
  })

  describe('onAddMitre', () => {
    it('adds a mitre cut with defaults and undo removes it', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onAddMitre(partId)
      })
      expect(asBoard(result.current.scene.parts[0]).cuts).toHaveLength(1)
      const mitre = asBoard(result.current.scene.parts[0]).cuts[0]
      expect(mitre.kind).toBe('mitre')
      if (mitre.kind !== 'mitre') throw new Error('expected mitre')
      expect(mitre).toMatchObject({ end: '+X', axis: 'Z', angle: 45 })
      act(() => {
        result.current.undo()
      })
      expect(asBoard(result.current.scene.parts[0]).cuts).toHaveLength(0)
    })

    it('editing the mitre angle via onUpdateCut updates it', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onAddMitre(partId)
      })
      const mitreId = asBoard(result.current.scene.parts[0]).cuts[0].id
      act(() => {
        result.current.onUpdateCut(partId, mitreId, (c) =>
          c.kind !== 'mitre' ? c : { ...c, angle: 30 },
        )
      })
      const updated = asBoard(result.current.scene.parts[0]).cuts[0]
      if (updated.kind !== 'mitre') throw new Error('expected mitre')
      expect(updated.angle).toBe(30)
    })
  })

  describe('onRemoveCut', () => {
    it('removes cut from the part', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(
          partId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_1',
                  label: 'Cut 1',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 0 },
                  size: { x: 20, y: 20, z: 10 },
                },
              ],
            }) as Part,
        )
      })
      act(() => {
        result.current.onRemoveCut(partId, 'cut_1')
      })
      expect(asBoard(result.current.scene.parts[0]).cuts).toHaveLength(0)
    })

    it('clears stale pairedCutId references on other parts', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      act(() => {
        result.current.onUpdate(
          partAId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_a',
                  label: 'A',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                },
              ],
            }) as Part,
        )
        result.current.onUpdate(
          partBId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_b',
                  label: 'B',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                  pairedCutId: `${partAId}:cut_a`,
                },
              ],
            }) as Part,
        )
      })

      act(() => {
        result.current.onRemoveCut(partAId, 'cut_a')
      })

      expect(asBoard(result.current.scene.parts[0]).cuts).toHaveLength(0)
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).pairedCutId).toBeUndefined()
    })

    it('undo restores cut and paired references in one step', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      act(() => {
        result.current.onUpdate(
          partAId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_a',
                  label: 'A',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                },
              ],
            }) as Part,
        )
        result.current.onUpdate(
          partBId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_b',
                  label: 'B',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                  pairedCutId: `${partAId}:cut_a`,
                },
              ],
            }) as Part,
        )
      })

      act(() => {
        result.current.onRemoveCut(partAId, 'cut_a')
      })
      act(() => {
        result.current.undo()
      })

      expect(asBoard(result.current.scene.parts[0]).cuts).toHaveLength(1)
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).pairedCutId).toBe(
        `${partAId}:cut_a`,
      )
    })
  })

  describe('onLinkCuts', () => {
    it('sets pairedCutId bidirectionally', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      act(() => {
        result.current.onUpdate(
          partAId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_a',
                  label: 'A',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 30, y: 40, z: 10 },
                },
              ],
            }) as Part,
        )
        result.current.onUpdate(
          partBId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_b',
                  label: 'B',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 10, y: 10, z: 10 },
                },
              ],
            }) as Part,
        )
      })

      act(() => {
        result.current.onLinkCuts(partAId, 'cut_a', partBId, 'cut_b')
      })

      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).pairedCutId).toBe(
        `${partBId}:cut_b`,
      )
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).pairedCutId).toBe(
        `${partAId}:cut_a`,
      )
      // u/v sizes from A (+Z: u=x, v=y) propagated to B
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).size.x).toBe(30)
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).size.y).toBe(40)
    })

    it('undo clears both pairedCutIds', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(
          partAId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_a',
                  label: 'A',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 30, y: 40, z: 10 },
                },
              ],
            }) as Part,
        )
        result.current.onUpdate(
          partBId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_b',
                  label: 'B',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 10, y: 10, z: 10 },
                },
              ],
            }) as Part,
        )
      })
      act(() => {
        result.current.onLinkCuts(partAId, 'cut_a', partBId, 'cut_b')
      })
      act(() => {
        result.current.undo()
      })
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).pairedCutId).toBeUndefined()
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).pairedCutId).toBeUndefined()
    })
  })

  describe('onUnlinkCuts', () => {
    it('clears pairedCutId on both sides', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(
          partAId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_a',
                  label: 'A',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                  pairedCutId: `${partBId}:cut_b`,
                },
              ],
            }) as Part,
        )
        result.current.onUpdate(
          partBId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_b',
                  label: 'B',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                  pairedCutId: `${partAId}:cut_a`,
                },
              ],
            }) as Part,
        )
      })
      act(() => {
        result.current.onUnlinkCuts(partAId, 'cut_a')
      })
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).pairedCutId).toBeUndefined()
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).pairedCutId).toBeUndefined()
    })

    it('undo restores both pairedCutIds', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd('board')
      })
      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(
          partAId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_a',
                  label: 'A',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                  pairedCutId: `${partBId}:cut_b`,
                },
              ],
            }) as Part,
        )
        result.current.onUpdate(
          partBId,
          (p) =>
            ({
              ...p,
              cuts: [
                {
                  id: 'cut_b',
                  label: 'B',
                  kind: 'box' as const,
                  face: '+Z' as const,
                  position: { x: 0, y: 0, z: 15 },
                  size: { x: 20, y: 20, z: 10 },
                  pairedCutId: `${partAId}:cut_a`,
                },
              ],
            }) as Part,
        )
      })
      act(() => {
        result.current.onUnlinkCuts(partAId, 'cut_a')
      })
      act(() => {
        result.current.undo()
      })
      expect((asBoard(result.current.scene.parts[0]).cuts[0] as BoxCut).pairedCutId).toBe(
        `${partBId}:cut_b`,
      )
      expect((asBoard(result.current.scene.parts[1]).cuts[0] as BoxCut).pairedCutId).toBe(
        `${partAId}:cut_a`,
      )
    })
  })

  it('exportStep builds one spec per part with a 16-element matrix and returns the worker string', async () => {
    mockExportStep.mockResolvedValue('ISO-10303-21;\nENDSEC;')
    const { result } = renderHook(() => useScene())
    const parts = result.current.scene.parts

    const text = await result.current.exportStep(parts)

    expect(text).toContain('ISO-10303-21')
    expect(mockExportStep).toHaveBeenCalledTimes(1)
    const specs = mockExportStep.mock.calls[0][0] as Array<{
      label: string
      length: number
      cuts: unknown[]
      matrix: number[]
    }>
    expect(specs).toHaveLength(parts.length)
    expect(specs[0].label).toBe(parts[0].label)
    expect(specs[0].length).toBe(parts[0].length)
    expect(specs[0].matrix).toHaveLength(16)
    expect(Array.isArray(specs[0].cuts)).toBe(true)
  })

  it('starts with materials: {} and hardware: []', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.scene.materials).toEqual({})
    expect(result.current.scene.hardware).toEqual([])
  })

  it('onAdd preserves existing materials and hardware', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 50 })
    })
    act(() => {
      result.current.onUpdateHardware([
        {
          id: '1',
          name: 'Screw',
          qty: 10,
          unit: 'pcs',
          supplier: '',
          partNumber: '',
          unitCost: 0.5,
          notes: '',
          linkedPartIds: [],
        },
      ])
    })
    act(() => {
      result.current.onAdd('board')
    })
    expect(result.current.scene.materials).toEqual({ Plywood: { costPerM2: 50 } })
    expect(result.current.scene.hardware).toHaveLength(1)
  })

  it('onUpdateMaterial sets a material rate on the scene', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 40 })
    })
    expect(result.current.scene.materials).toEqual({ Plywood: { costPerM2: 40 } })
  })

  it('onUpdateMaterial undo restores previous materials', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 40 })
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.materials).toEqual({})
  })

  it('onUpdateMaterial redo reapplies rate after undo', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 40 })
    })
    act(() => {
      result.current.undo()
    })
    act(() => {
      result.current.redo()
    })
    expect(result.current.scene.materials).toEqual({ Plywood: { costPerM2: 40 } })
  })

  it('onUpdateMaterial coalesces rapid calls into one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 10 })
    })
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 20 })
    })
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 30 })
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.materials).toEqual({})
  })

  it('onUpdateHardware sets hardware items', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const items = [
      {
        id: 'h1',
        name: 'Hinge',
        qty: 4,
        unit: 'pcs',
        supplier: 'Ace',
        partNumber: 'H-100',
        unitCost: 2.5,
        notes: '',
        linkedPartIds: [],
      },
    ]
    act(() => {
      result.current.onUpdateHardware(items)
    })
    expect(result.current.scene.hardware).toEqual(items)
  })

  it('onUpdateHardware undo restores previous hardware', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const items = [
      {
        id: 'h1',
        name: 'Hinge',
        qty: 4,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: 2.5,
        notes: '',
        linkedPartIds: [],
      },
    ]
    act(() => {
      result.current.onUpdateHardware(items)
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.hardware).toEqual([])
  })

  it('onUpdateHardware redo reapplies items after undo', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const items = [
      {
        id: 'h1',
        name: 'Hinge',
        qty: 4,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: 2.5,
        notes: '',
        linkedPartIds: [],
      },
    ]
    act(() => {
      result.current.onUpdateHardware(items)
    })
    act(() => {
      result.current.undo()
    })
    act(() => {
      result.current.redo()
    })
    expect(result.current.scene.hardware).toEqual(items)
  })

  it('onAdd("cylinder") adds a dowel with default Ø8 × 100', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const before = result.current.scene.parts.length
    act(() => result.current.onAdd('cylinder'))
    const added = result.current.scene.parts[result.current.scene.parts.length - 1]
    expect(result.current.scene.parts.length).toBe(before + 1)
    expect(added.kind).toBe('cylinder')
    if (added.kind === 'cylinder') {
      expect(added.diameter).toBe(8)
      expect(added.length).toBe(100)
      expect(added.label).toBe('Dowel 1')
    }
  })

  it('dowel labels do not collide after delete and re-add', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => result.current.onAdd('cylinder')) // Dowel 1
    act(() => result.current.onAdd('cylinder')) // Dowel 2
    act(() => result.current.onAdd('cylinder')) // Dowel 3
    const first = result.current.scene.parts.find(
      (p) => p.kind === 'cylinder' && p.label === 'Dowel 1',
    )!
    expect(first.label).toBe('Dowel 1')
    act(() => result.current.onRemove(first.id)) // remove Dowel 1; count now 2
    act(() => result.current.onAdd('cylinder')) // count-based: "Dowel 3" — COLLISION with existing
    const labels = result.current.scene.parts
      .filter((p) => p.kind === 'cylinder')
      .map((p) => p.label)
    expect(new Set(labels).size).toBe(labels.length) // all unique
  })

  it('onDuplicate of a dowel clones it with a new id', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => result.current.onAdd('cylinder'))
    const orig = result.current.scene.parts[result.current.scene.parts.length - 1]
    act(() => result.current.onDuplicate(orig.id))
    const clone = result.current.scene.parts[result.current.scene.parts.length - 1]
    expect(clone.id).not.toBe(orig.id)
    expect(clone.kind).toBe('cylinder')
  })
})

describe('buildSpecForPart — cylinder cuts', () => {
  it('passes dowel cuts through to the build spec', () => {
    const part: CylinderPart = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel 1',
      diameter: 8,
      length: 100,
      material: '',
      color: '#fff',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [
        { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
      ],
      visible: true,
      parentId: null,
      driven: false,
    }
    const spec = buildSpecForPart(part)
    expect(spec.kind).toBe('cylinder')
    if (spec.kind === 'cylinder') {
      expect(spec.cuts).toHaveLength(1)
      expect(spec.cuts[0]).toMatchObject({ kind: 'end', angle: 45 })
    }
  })
})

describe('useScene — joints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  const hit = (partId: string, ln: { x: number; y: number; z: number }): FaceHit => ({
    partId,
    faceNormal: ln,
    faceCenter: { x: 0, y: 0, z: 0 },
    localFaceNormal: ln,
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 0, y: 0, z: 0 },
  })

  // Add a housing board + a vertically-standing housed board; return their ids.
  async function twoBoards(result: { current: ReturnType<typeof useScene> }) {
    await act(async () => {
      result.current.onAdd('board')
    })
    await act(async () => {
      result.current.onAdd('board')
    })
    const [H, D] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(D.id, (p) => ({ ...p, rotation: { x: 0, y: 90, z: 0 } }), 'rot')
    })
    return { Hid: H.id, Did: D.id }
  }

  it('onAddJoint creates a joint + derived groove in a single undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)

    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })

    expect(result.current.scene.joints).toHaveLength(1)
    const H = asBoard(result.current.scene.parts.find((p) => p.id === Hid)!)
    expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId)).toBe(true)

    await act(async () => {
      result.current.undo()
    })
    expect(result.current.scene.joints).toHaveLength(0)
    const H2 = asBoard(result.current.scene.parts.find((p) => p.id === Hid)!)
    expect(H2.cuts.length).toBe(0)
  })

  // Characterization test. These defaults decide the real cut geometry a user gets, and
  // nothing else asserted any of them, so any refactor of the creator could change every
  // user's dado silently. Pinned here before extracting them into a shared helper.
  it('onAddJoint seeds the documented dado defaults', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)

    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })

    const joint = result.current.scene.joints[0] as DadoJoint
    // Centering the groove lands on 12.500000000000005, so this one field cannot be ===.
    expect(joint.offset).toBeCloseTo(12.5, 6)
    expect({ ...joint, id: '<uuid>', offset: '<float>' }).toEqual({
      kind: 'dado',
      id: '<uuid>',
      label: 'Dado 1',
      driven: false,
      housingPartId: Hid,
      housingFace: '+Z',
      housedPartId: Did,
      housedEnd: '+X',
      offset: '<float>',
      depth: 8, // defaultDadoDepth on a 25mm housing
      clearance: 0,
      profile: 'plain',
      tongueThickness: 13, // round(housed.thickness / 2)
      rabbetFace: '+Z',
      stopStart: 0,
      stopEnd: 0,
    })
  })

  it('onRemove of a participating part cascades the joint, single undo restores both', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)
    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })

    await act(async () => {
      result.current.onRemove(Did)
    })
    expect(result.current.scene.joints).toHaveLength(0)
    const H = asBoard(result.current.scene.parts.find((p) => p.id === Hid)!)
    expect(H.cuts.length).toBe(0)

    await act(async () => {
      result.current.undo()
    })
    expect(result.current.scene.parts.some((p) => p.id === Did)).toBe(true)
    expect(result.current.scene.joints).toHaveLength(1)
  })

  it('resizing the housed board re-derives the groove width', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)
    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })
    const grooveWidth = () => {
      const H = asBoard(result.current.scene.parts.find((p) => p.id === Hid)!)
      const g = H.cuts.find((c) => c.kind === 'box' && c.sourceJointId)
      return g && g.kind === 'box' ? g.size.x : -1
    }
    const before = grooveWidth()
    await act(async () => {
      result.current.onUpdate(Did, (p) => (p.kind === 'board' ? { ...p, thickness: 40 } : p), 'thk')
    })
    expect(grooveWidth()).not.toBe(before)
    expect(grooveWidth()).toBe(40)
  })

  it('flipping a joint to rabbeted adds the housed rabbet cut in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)
    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })
    const jointId = result.current.scene.joints[0].id
    const housedRabbets = () => {
      const D = result.current.scene.parts.find((p) => p.id === Did)!
      return D.kind === 'board'
        ? D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === jointId).length
        : 0
    }
    expect(housedRabbets()).toBe(0) // plain: no rabbet on the housed board

    await act(async () => {
      result.current.onUpdateJoint(jointId, (j) => ({ ...j, profile: 'rabbeted' }))
    })
    expect(housedRabbets()).toBe(1) // rabbeted: one derived cut on the housed board

    await act(async () => {
      result.current.undo()
    })
    expect(housedRabbets()).toBe(0) // single undo restores plain
    expect((result.current.scene.joints[0] as DadoJoint).profile).toBe('plain')
  })

  it('setting a stop adds the housed notch cut in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)
    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })
    const jointId = result.current.scene.joints[0].id
    const housedNotches = () => {
      const D = result.current.scene.parts.find((p) => p.id === Did)!
      return D.kind === 'board'
        ? D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === jointId).length
        : 0
    }
    expect(housedNotches()).toBe(0) // through: no notch on the housed board

    await act(async () => {
      result.current.onUpdateJoint(jointId, (j) => ({ ...j, stopStart: 20 }))
    })
    expect(housedNotches()).toBe(1) // stopped: one notch on the housed board

    await act(async () => {
      result.current.undo()
    })
    expect(housedNotches()).toBe(0) // single undo restores through
    expect((result.current.scene.joints[0] as DadoJoint).stopStart).toBe(0)
  })

  it('onAddHalfLap creates a half-lap + two lap cuts in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [P, Q] = result.current.scene.parts
    // Force them coplanar + fully overlapping so the half-lap is valid (not stale),
    // independent of onAdd's default placement.
    await act(async () => {
      result.current.onUpdate(
        P.id,
        (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }),
        'posP',
      )
      result.current.onUpdate(
        Q.id,
        (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }),
        'posQ',
      )
    })
    await act(async () => {
      result.current.onAddHalfLap(P.id, Q.id)
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('halflap')
    const lapCuts = () =>
      result.current.scene.parts.filter(
        (p) => p.kind === 'board' && p.cuts.some((c) => c.kind === 'box' && c.sourceJointId),
      ).length
    expect(lapCuts()).toBe(2) // one lap cut on each board

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(lapCuts()).toBe(0)
  })

  // Characterization test — same reasoning as the dado and mortise & tenon ones.
  it('onAddHalfLap seeds the documented half-lap defaults', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [P, Q] = result.current.scene.parts
    await act(async () => {
      result.current.onAddHalfLap(P.id, Q.id)
    })

    const joint = result.current.scene.joints[0] as HalfLapJoint
    expect({ ...joint, id: '<uuid>' }).toEqual({
      kind: 'halflap',
      id: '<uuid>',
      label: 'Half-lap 1',
      driven: false,
      partAId: P.id,
      partBId: Q.id,
      split: 0.5, // a true half-lap: each board keeps half its thickness
      clearance: 0,
    })
  })

  it('onAddMortiseTenon creates a mortise & tenon + cuts + seat in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Mb, Tb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(
        Mb.id,
        (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }),
        'posM',
      )
      result.current.onUpdate(
        Tb.id,
        (p) => ({ ...p, position: { x: 0, y: 0, z: 60 }, rotation: { x: 0, y: 90, z: 0 } }),
        'posT',
      )
    })
    await act(async () => {
      result.current.onAddMortiseTenon(
        hit(Mb.id, { x: 0, y: 0, z: 1 }),
        hit(Tb.id, { x: 1, y: 0, z: 0 }),
      )
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('mortise-tenon')
    const jointCuts = () =>
      result.current.scene.parts
        .filter((p) => p.kind === 'board')
        .reduce(
          (n, p) =>
            n +
            (p.kind === 'board'
              ? p.cuts.filter((c) => c.kind === 'box' && c.sourceJointId).length
              : 0),
          0,
        )
    expect(jointCuts()).toBeGreaterThanOrEqual(2) // shoulders on tenon + pocket on mortise

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(jointCuts()).toBe(0)
  })

  // Characterization test — same reasoning as the dado one above.
  it('onAddMortiseTenon seeds the documented mortise & tenon defaults', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Mb, Tb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(
        Mb.id,
        (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }),
        'posM',
      )
      result.current.onUpdate(
        Tb.id,
        (p) => ({ ...p, position: { x: 0, y: 0, z: 60 }, rotation: { x: 0, y: 90, z: 0 } }),
        'posT',
      )
    })
    await act(async () => {
      result.current.onAddMortiseTenon(
        hit(Mb.id, { x: 0, y: 0, z: 1 }),
        hit(Tb.id, { x: 1, y: 0, z: 0 }),
      )
    })

    const joint = result.current.scene.joints[0] as MortiseTenonJoint
    // Centering on the mortise face lands on 12.500000000000005, so offsetU cannot be ===.
    expect(joint.offsetU).toBeCloseTo(12.5, 6)
    expect({ ...joint, id: '<uuid>', offsetU: '<float>' }).toEqual({
      kind: 'mortise-tenon',
      id: '<uuid>',
      label: 'Mortise & tenon 1',
      driven: false,
      mortisePartId: Mb.id,
      mortiseFace: '+Z',
      tenonPartId: Tb.id,
      tenonEnd: '+X',
      tenonLength: 17, // round(mortise.thickness * 2 / 3) on a 25mm mortise board
      tenonThickness: 8, // round(tenon.thickness / 3)
      tenonWidth: 84, // tenon.width - 2 * tenonThickness
      clearance: 0,
      through: false,
      offsetU: '<float>',
      offsetV: 50,
    })
  })

  it('onAddFingerJoint creates a finger joint + cuts on both boards + seat in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Ab, Bb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(
        Ab.id,
        (p) => ({
          ...p,
          length: 200,
          width: 80,
          thickness: 18,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        }),
        'a',
      )
      result.current.onUpdate(
        Bb.id,
        (p) => ({
          ...p,
          length: 200,
          width: 80,
          thickness: 18,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 90, z: 0 },
        }),
        'b',
      )
    })
    await act(async () => {
      result.current.onAddFingerJoint(
        hit(Ab.id, { x: 1, y: 0, z: 0 }),
        hit(Bb.id, { x: 1, y: 0, z: 0 }),
      )
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('finger')
    const jointCuts = () =>
      result.current.scene.parts
        .filter((p) => p.kind === 'board')
        .reduce(
          (n, p) =>
            n +
            (p.kind === 'board'
              ? p.cuts.filter((c) => c.kind === 'box' && c.sourceJointId).length
              : 0),
          0,
        )
    expect(jointCuts()).toBeGreaterThanOrEqual(2) // fingers on both boards

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(jointCuts()).toBe(0)
  })

  // Characterization test — same reasoning as the other joint kinds.
  it('onAddFingerJoint seeds the documented finger defaults', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Ab, Bb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(
        Ab.id,
        (p) => ({
          ...p,
          length: 200,
          width: 80,
          thickness: 18,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        }),
        'a',
      )
      result.current.onUpdate(
        Bb.id,
        (p) => ({
          ...p,
          length: 200,
          width: 80,
          thickness: 18,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 90, z: 0 },
        }),
        'b',
      )
    })
    await act(async () => {
      result.current.onAddFingerJoint(
        hit(Ab.id, { x: 1, y: 0, z: 0 }),
        hit(Bb.id, { x: 1, y: 0, z: 0 }),
      )
    })

    const joint = result.current.scene.joints[0] as FingerJoint
    expect({ ...joint, id: '<uuid>' }).toEqual({
      kind: 'finger',
      id: '<uuid>',
      label: 'Finger joint 1',
      driven: false,
      partAId: Ab.id,
      endA: '+X',
      partBId: Bb.id,
      endB: '+X',
      // clamp(round(width / 2*thickness), 3, 15) — 80/(2*18) rounds to 2, so the floor applies
      fingerCount: 3,
      clearance: 0,
    })
  })

  it('onAddTongueGroove creates a tongue-groove joint + cuts on both boards + seat in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Gb, Tb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(
        Gb.id,
        (p) => ({
          ...p,
          length: 800,
          width: 150,
          thickness: 18,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        }),
        'g',
      )
      result.current.onUpdate(
        Tb.id,
        (p) => ({
          ...p,
          length: 800,
          width: 150,
          thickness: 18,
          position: { x: 0, y: 160, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        }),
        't',
      )
    })
    await act(async () => {
      result.current.onAddTongueGroove(
        hit(Gb.id, { x: 0, y: 1, z: 0 }), // groove board +Y edge
        hit(Tb.id, { x: 0, y: -1, z: 0 }), // tongue board -Y edge
      )
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('tongue-groove')
    const jointCuts = () =>
      result.current.scene.parts
        .filter((p) => p.kind === 'board')
        .reduce(
          (n, p) =>
            n +
            (p.kind === 'board'
              ? p.cuts.filter((c) => c.kind === 'box' && c.sourceJointId).length
              : 0),
          0,
        )
    expect(jointCuts()).toBe(3) // 1 groove + 2 shoulders

    // Characterization of the seeded parameters — same reasoning as the other joint kinds.
    const tgJoint = result.current.scene.joints[0] as TongueGrooveJoint
    expect({ ...tgJoint, id: '<uuid>' }).toEqual({
      kind: 'tongue-groove',
      id: '<uuid>',
      label: 'Tongue & groove 1',
      driven: false,
      groovePartId: Gb.id,
      grooveEdge: '+Y',
      tonguePartId: Tb.id,
      tongueEdge: '-Y',
      tongueThickness: 6, // min(max(3, round(18/3)), 18-2)
      tongueDepth: 8, // min(8, floor(min(150,150)/2) - 1)
      clearance: 0,
    })

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(jointCuts()).toBe(0)
  })
})

describe('selection of parts and components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  it('selects a component and reports its kind', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onSelect({ kind: 'component', id: 'cmp_1' }))
    expect(result.current.selection).toEqual({ kind: 'component', id: 'cmp_1' })
  })

  it('exposes selectedId for a part selection and null for a component selection', () => {
    const { result } = renderHook(() => useScene())
    const partId = result.current.scene.parts[0].id
    act(() => result.current.onSelect({ kind: 'part', id: partId }))
    expect(result.current.selectedId).toBe(partId)
    act(() => result.current.onSelect({ kind: 'component', id: 'cmp_1' }))
    expect(result.current.selectedId).toBeNull()
  })

  it('clears both on a null selection', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onSelect({ kind: 'part', id: result.current.scene.parts[0].id }))
    act(() => result.current.onSelect(null))
    expect(result.current.selection).toBeNull()
    expect(result.current.selectedId).toBeNull()
  })

  it('onRemove clears a part selection for the removed part but leaves a component selection', () => {
    const partSel = renderHook(() => useScene()).result
    const partId = partSel.current.scene.parts[0].id
    act(() => partSel.current.onSelect({ kind: 'part', id: partId }))
    act(() => partSel.current.onRemove(partId))
    expect(partSel.current.selection).toBeNull()

    const componentSel = renderHook(() => useScene()).result
    act(() => componentSel.current.onSelect({ kind: 'component', id: 'cmp_1' }))
    act(() => componentSel.current.onRemove(componentSel.current.scene.parts[0].id))
    expect(componentSel.current.selection).toEqual({ kind: 'component', id: 'cmp_1' })
  })
})

describe('component CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  const halfLap = (id: string, partAId: string, partBId: string): HalfLapJoint => ({
    kind: 'halflap',
    id,
    label: id,
    driven: false,
    partAId,
    partBId,
    split: 0.5,
    clearance: 0,
  })

  it('adds a group component at top level', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    expect(result.current.scene.components).toHaveLength(1)
    expect(result.current.scene.components[0].parentId).toBeNull()
    expect(result.current.scene.components[0].kind).toBe('group')
  })

  it('nests a component under a parent', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const parentId = result.current.scene.components[0].id
    act(() => result.current.onAddComponent(parentId))
    expect(result.current.scene.components[1].parentId).toBe(parentId)
  })

  it('deletes driven descendants but promotes detached ones to top level', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    const seed = result.current.scene.parts[0]
    act(() =>
      result.current.replaceScene({
        ...result.current.scene,
        parts: [
          { ...seed, id: 'driven1', parentId: cmpId, driven: true },
          { ...seed, id: 'mine1', parentId: cmpId, driven: false },
        ],
      }),
    )
    act(() => result.current.onRemoveComponent(cmpId))

    const ids = result.current.scene.parts.map((p) => p.id)
    expect(ids).not.toContain('driven1')
    expect(ids).toContain('mine1')
    expect(result.current.scene.parts.find((p) => p.id === 'mine1')?.parentId).toBeNull()
  })

  it('deletes nested child components too', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const a = result.current.scene.components[0].id
    act(() => result.current.onAddComponent(a))
    act(() => result.current.onRemoveComponent(a))
    expect(result.current.scene.components).toHaveLength(0)
  })

  it('drops joints the deleted component sourced, and joints left dangling, but keeps hand-made ones', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    const seed = result.current.scene.parts[0]
    act(() =>
      result.current.replaceScene({
        ...result.current.scene,
        parts: [
          { ...seed, id: 'driven1', parentId: cmpId, driven: true },
          { ...seed, id: 'mine1', parentId: cmpId, driven: false },
          { ...seed, id: 'outside1', parentId: null, driven: false },
        ],
        joints: [
          { ...halfLap('j_sourced', 'mine1', 'outside1'), sourceComponentId: cmpId },
          halfLap('j_dangling', 'driven1', 'outside1'),
          halfLap('j_handmade', 'mine1', 'outside1'),
        ],
      }),
    )
    act(() => result.current.onRemoveComponent(cmpId))

    expect(result.current.scene.joints.map((j) => j.id)).toEqual(['j_handmade'])
  })

  it('refuses a reparent that would create a cycle', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const a = result.current.scene.components[0].id
    act(() => result.current.onAddComponent(a))
    const b = result.current.scene.components[1].id

    act(() => result.current.onReparentComponent(a, b))

    expect(result.current.scene.components.find((c) => c.id === a)?.parentId).toBeNull()
  })

  it('undoes a component deletion, restoring its driven parts', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const id = result.current.scene.components[0].id
    const seed = result.current.scene.parts[0]
    act(() =>
      result.current.replaceScene({
        ...result.current.scene,
        parts: [{ ...seed, id: 'driven1', parentId: id, driven: true }],
      }),
    )
    act(() => result.current.onRemoveComponent(id))
    expect(result.current.scene.components).toHaveLength(0)

    act(() => result.current.undo())
    expect(result.current.scene.components.map((c) => c.id)).toEqual([id])
    expect(result.current.scene.parts.map((p) => p.id)).toContain('driven1')
  })

  it('coalesces consecutive edits to the same component into one undo entry', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const id = result.current.scene.components[0].id
    act(() => result.current.onUpdateComponent(id, (c) => ({ ...c, label: 'A' })))
    act(() => result.current.onUpdateComponent(id, (c) => ({ ...c, label: 'AB' })))
    act(() => result.current.onUpdateComponent(id, (c) => ({ ...c, label: 'ABC' })))

    act(() => result.current.undo())
    // one undo returns to the pre-edit label, not to 'AB'
    expect(result.current.scene.components[0].label).toBe('Group 1')
  })

  it('numbers component labels from the highest existing number', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    act(() => result.current.onAddComponent(null))
    expect(result.current.scene.components.map((c) => c.label)).toEqual(['Group 1', 'Group 2'])
  })

  it('clears the selection when the selected component is deleted', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    act(() => result.current.onSelect({ kind: 'component', id: cmpId }))
    act(() => result.current.onRemoveComponent(cmpId))
    expect(result.current.selection).toBeNull()
  })

  it('clears a selection pointing at a deleted descendant component', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const parentId = result.current.scene.components[0].id
    act(() => result.current.onAddComponent(parentId))
    const childId = result.current.scene.components[1].id
    act(() => result.current.onSelect({ kind: 'component', id: childId }))
    act(() => result.current.onRemoveComponent(parentId))
    expect(result.current.selection).toBeNull()
  })

  it('keeps a part selection when a component is deleted', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    const partId = result.current.scene.parts[0].id
    act(() => result.current.onSelect({ kind: 'part', id: partId }))
    act(() => result.current.onRemoveComponent(cmpId))
    expect(result.current.selection).toEqual({ kind: 'part', id: partId })
  })
})

describe('deleting a component preserves where detached parts are', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0]),
      normals: new Float32Array([0, 0, 1]),
    })
  })

  it('bakes the lost ancestor placement into a promoted part so it does not move', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    const seed = result.current.scene.parts[0]

    act(() =>
      result.current.replaceScene({
        ...result.current.scene,
        components: [
          {
            ...result.current.scene.components[0],
            position: { x: 500, y: -200, z: 30 },
            rotation: { x: 0, y: 0, z: 90 },
          },
        ],
        parts: [
          {
            ...seed,
            id: 'mine1',
            parentId: cmpId,
            driven: false,
            position: { x: 10, y: 20, z: 0 },
          },
        ],
      }),
    )

    const before = resolveWorldMatrix(
      result.current.scene.parts.find((p) => p.id === 'mine1')!,
      componentsById(result.current.scene.components),
    )

    act(() => result.current.onRemoveComponent(cmpId))

    const kept = result.current.scene.parts.find((p) => p.id === 'mine1')!
    expect(kept.parentId).toBeNull()
    const after = resolveWorldMatrix(kept, componentsById(result.current.scene.components))
    for (let i = 0; i < 16; i++) expect(after[i]).toBeCloseTo(before[i], 6)
  })

  it('leaves a top-level detached part untouched', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddComponent(null))
    const cmpId = result.current.scene.components[0].id
    const seed = result.current.scene.parts[0]
    act(() =>
      result.current.replaceScene({
        ...result.current.scene,
        parts: [
          { ...seed, id: 'inside', parentId: cmpId, driven: false },
          { ...seed, id: 'outside', parentId: null, driven: false, position: { x: 7, y: 8, z: 9 } },
        ],
      }),
    )
    act(() => result.current.onRemoveComponent(cmpId))
    const outside = result.current.scene.parts.find((p) => p.id === 'outside')!
    expect(outside.position).toEqual({ x: 7, y: 8, z: 9 })
  })
})

describe('carcase generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  const base = CARCASE_PRESETS[0]

  function drivenPartsOf(scene: Scene, componentId: string): Part[] {
    return scene.parts.filter((p) => p.parentId === componentId && p.driven)
  }

  it('adds a carcase component and its driven parts', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(base))

    expect(result.current.scene.components).toHaveLength(1)
    const component = result.current.scene.components[0]
    expect(component.kind).toBe('carcase')
    expect(component.label).toBe('Base 600')

    const driven = drivenPartsOf(result.current.scene, component.id)
    expect(driven.length).toBe(carcaseRoles(base.params).length)
    expect(driven.map((p) => p.role)).toContain('left-side')
    expect(driven.every((p) => p.parentId === component.id)).toBe(true)
  })

  it('resizes driven parts when a parameter changes', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(base))
    const componentId = result.current.scene.components[0].id
    const before = asBoard(result.current.scene.parts.find((p) => p.role === 'left-side')!)

    act(() =>
      result.current.onUpdateComponent(componentId, (c) =>
        c.kind === 'carcase' ? { ...c, params: { ...c.params, depth: c.params.depth + 40 } } : c,
      ),
    )

    const after = asBoard(result.current.scene.parts.find((p) => p.role === 'left-side')!)
    expect(after.id).toBe(before.id)
    expect(after.length).toBe(before.length + 40)
  })

  it('undoes the component and every generated part in one step', () => {
    const { result } = renderHook(() => useScene())
    const partsBefore = result.current.scene.parts.length
    act(() => result.current.onAddCarcase(base))
    expect(result.current.scene.parts.length).toBeGreaterThan(partsBefore)

    act(() => result.current.undo())

    expect(result.current.scene.components).toHaveLength(0)
    expect(result.current.scene.parts).toHaveLength(partsBefore)
    expect(result.current.canUndo).toBe(false)
  })

  it('keeps the component-owned toe-kick notch through reconcileJoints', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(base))
    const componentId = result.current.scene.components[0].id

    const side = asBoard(result.current.scene.parts.find((p) => p.role === 'left-side')!)
    const notch = side.cuts.find(
      (c): c is BoxCut => c.kind === 'box' && c.sourceComponentId === componentId,
    )
    expect(notch).toBeDefined()
    expect(notch!.label).toBe('Toe Kick Notch')
    expect(notch!.size.y).toBe(base.params.toeKickHeight)
  })

  it('survives a save/load round trip and regenerates without duplicating', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(base))
    const saved = result.current.scene
    const componentId = saved.components[0].id
    const savedIds = saved.parts.map((p) => p.id).sort()

    // What useFile.buildEnvelope + serialize write to disk.
    const text = JSON.stringify(
      {
        version: FILE_FORMAT_VERSION,
        name: 'Round Trip',
        appVersion: '0.0.0',
        units: 'mm',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        camera: { position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
        scene: saved,
      } satisfies ZimmuFile,
      (_key, value: unknown) => (typeof value === 'number' ? parseFloat(value.toFixed(6)) : value),
      2,
    )

    const reloaded = parseFile(text).scene
    const reloadedSide = asBoard(reloaded.parts.find((p) => p.role === 'left-side')!)
    expect(reloadedSide.driven).toBe(true)
    expect(reloadedSide.parentId).toBe(componentId)
    expect(reloaded.components[0].kind).toBe('carcase')

    // replaceScene is the load path, and it runs the same pipeline as every other mutation. A
    // generator that did not recognise its own reloaded output would emit a second cabinet here.
    act(() => result.current.replaceScene(reloaded))

    expect(result.current.scene.parts.map((p) => p.id).sort()).toEqual(savedIds)
    expect(drivenPartsOf(result.current.scene, componentId)).toHaveLength(
      drivenPartsOf(saved, componentId).length,
    )
  })
})

describe('a driven part edit is reconciled immediately', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0]),
      normals: new Float32Array([0, 0, 1]),
    })
  })

  it('does not leave a driven part disagreeing with the parameters that own it', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const side = result.current.scene.parts.find((p) => p.role === 'left-side')!
    if (side.kind !== 'board') throw new Error('expected a board')
    const generated = side.length

    // The cabinet owns a driven part's dimensions. Editing one directly must not persist — Phase 6
    // intercepts this with a "change the cabinet or detach" prompt, but until then the scene must
    // never be left in a state where a part's size disagrees with the params that generated it.
    act(() =>
      result.current.onUpdate(side.id, (p) =>
        p.kind === 'board' ? { ...p, length: p.length + 137 } : p,
      ),
    )

    const after = result.current.scene.parts.find((p) => p.id === side.id)!
    if (after.kind !== 'board') throw new Error('expected a board')
    expect(after.length).toBe(generated)
  })

  it('still lets a detached part keep a hand edit', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const side = result.current.scene.parts.find((p) => p.role === 'left-side')!
    act(() => result.current.onUpdate(side.id, (p) => ({ ...p, driven: false, role: undefined })))

    act(() =>
      result.current.onUpdate(side.id, (p) =>
        p.kind === 'board' ? { ...p, length: 999 } : p,
      ),
    )

    const after = result.current.scene.parts.find((p) => p.id === side.id)!
    if (after.kind !== 'board') throw new Error('expected a board')
    expect(after.length).toBe(999)
  })
})

describe('detach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0]),
      normals: new Float32Array([0, 0, 1]),
    })
  })

  it('detaches a driven part and stops regenerating it', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const shelf = result.current.scene.parts.find((p) => p.role?.startsWith('shelf-'))!
    const cmpId = result.current.scene.components[0].id

    act(() => result.current.onDetachPart(shelf.id))
    const detached = result.current.scene.parts.find((p) => p.id === shelf.id)!
    expect(detached.driven).toBe(false)
    expect(detached.role).toBeUndefined()

    // A parameter change that would have moved it must now leave it alone.
    act(() =>
      result.current.onUpdateComponent(cmpId, (c) =>
        c.kind === 'carcase' ? { ...c, params: { ...c.params, height: 900 } } : c,
      ),
    )
    const after = result.current.scene.parts.find((p) => p.id === shelf.id)!
    expect(after.position).toEqual(detached.position)
  })

  it('undoes a detach', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const id = result.current.scene.parts.find((p) => p.role === 'left-side')!.id
    act(() => result.current.onDetachPart(id))
    expect(result.current.scene.parts.find((p) => p.id === id)!.driven).toBe(false)
    act(() => result.current.undo())
    expect(result.current.scene.parts.find((p) => p.id === id)!.driven).toBe(true)
  })

  it('reports the parameter a driven dimension maps to, and null where there is none', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const side = result.current.scene.parts.find((p) => p.role === 'left-side')!
    expect(result.current.parameterFor(side.id, 'length')).toBe('depth')
    expect(result.current.parameterFor(side.id, 'thickness')).toBe('thickness')

    const bottom = result.current.scene.parts.find((p) => p.role === 'bottom')!
    expect(result.current.parameterFor(bottom.id, 'length')).toBeNull()
  })

  it('reports null for a part that is not driven', () => {
    const { result } = renderHook(() => useScene())
    act(() => result.current.onAddCarcase(CARCASE_PRESETS[0]))
    const side = result.current.scene.parts.find((p) => p.role === 'left-side')!
    act(() => result.current.onDetachPart(side.id))
    expect(result.current.parameterFor(side.id, 'length')).toBeNull()
  })
})
