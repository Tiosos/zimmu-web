import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { CutDef } from './types'

const mockBuildPart = vi.fn()

vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart, buildBox: vi.fn() }),
  expose: vi.fn(),
  transfer: vi.fn((data: unknown) => data),
}))

vi.stubGlobal(
  'Worker',
  vi.fn(function MockWorker() {}),
)

import { useScene } from './useScene'

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
      result.current.onAdd()
    })
    expect(result.current.scene.parts).toHaveLength(1)
  })

  it('onAdd appends a new board when occtReady is true', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].label).toBe('Board 2')
  })

  it('onAdd auto-selects the new part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    const newId = result.current.scene.parts[1].id
    expect(result.current.selectedId).toBe(newId)
  })

  it('onRemove removes the part and clears selectedId when matched', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
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

  it('nextLabel increments with each add', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    expect(result.current.nextLabel).toBe('Board 2')
    act(() => {
      result.current.onAdd()
    })
    expect(result.current.nextLabel).toBe('Board 3')
  })

  it('replaceScene replaces parts, clears selectedId, resets labelCounter', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    act(() => {
      result.current.onSelect(result.current.scene.parts[1].id)
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
          color: '#d4a373',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ' as const,
          cuts: [],
          visible: true,
        },
      ],
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
      result.current.replaceScene({ parts: [] })
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
        result.current.onAdd()
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.undoLabel).toBe('Add Board 2')
      expect(result.current.canRedo).toBe(false)
    })

    it('undo after onAdd removes the added part', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
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
        result.current.onAdd()
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
        result.current.onAdd()
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
        result.current.onAdd()
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
        result.current.onAdd()
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
        result.current.onAdd()
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
          result.current.onAdd()
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
        result.current.onAdd()
      })
      expect(result.current.canUndo).toBe(true)
      act(() => {
        result.current.replaceScene({ parts: [] })
      })
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })

    it('undo after replaceScene is a no-op and does not throw', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })
      act(() => {
        result.current.replaceScene({ parts: [] })
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
        result.current.onAdd()
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.nextLabel).toBe('Board 2')
      act(() => {
        result.current.onAdd()
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
      result.current.onUpdate(id, (p) => ({
        ...p,
        cuts: [
          {
            id: 'cut_1',
            label: 'Cut 1',
            face: '+Z' as const,
            position: { x: 90, y: 40, z: 15 },
            size: { x: 20, y: 20, z: 10 },
          },
        ],
      }))
    })

    await waitFor(() =>
      expect(mockBuildPart).toHaveBeenCalledWith(
        'board',
        expect.objectContaining({
          cuts: [{ id: 'cut_1', position: { x: 90, y: 40, z: 15 }, size: { x: 20, y: 20, z: 10 } }],
        }),
      ),
    )
  })

  describe('onUpdateCut', () => {
    const cut1: CutDef = {
      id: 'cut_1',
      label: 'Cut 1',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }

    it('updates the matching cut', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(partId, (p) => ({ ...p, cuts: [cut1] }))
      })
      act(() => {
        result.current.onUpdateCut(partId, 'cut_1', (c) => ({ ...c, size: { ...c.size, x: 30 } }))
      })
      expect(result.current.scene.parts[0].cuts[0].size.x).toBe(30)
    })

    it('creates an undoable entry (single undo restores)', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(partId, (p) => ({ ...p, cuts: [cut1] }))
      })
      act(() => {
        result.current.onUpdateCut(partId, 'cut_1', (c) => ({ ...c, size: { ...c.size, x: 30 } }))
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].cuts[0].size.x).toBe(20)
    })

    it('propagates u/v sizes to paired cut; single undo restores both', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      const cutA: CutDef = {
        id: 'cut_a',
        label: 'Mortise',
        face: '+Z',
        position: { x: 90, y: 40, z: 15 },
        size: { x: 30, y: 50, z: 10 },
        pairedCutId: `${partBId}:cut_b`,
      }
      const cutB: CutDef = {
        id: 'cut_b',
        label: 'Tenon',
        face: '+Z',
        position: { x: 0, y: 0, z: 15 },
        size: { x: 30, y: 50, z: 10 },
        pairedCutId: `${partAId}:cut_a`,
      }

      act(() => {
        result.current.onUpdate(partAId, (p) => ({ ...p, cuts: [cutA] }))
        result.current.onUpdate(partBId, (p) => ({ ...p, cuts: [cutB] }))
      })

      // Update cut A's u-axis size (x for +Z face: axes.u='x')
      act(() => {
        result.current.onUpdateCut(partAId, 'cut_a', (c) => ({ ...c, size: { ...c.size, x: 40 } }))
      })

      // cut A updated
      expect(result.current.scene.parts[0].cuts[0].size.x).toBe(40)
      // cut B's u-axis (also x, both are +Z face) updated by propagation
      expect(result.current.scene.parts[1].cuts[0].size.x).toBe(40)

      // single undo restores both
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].cuts[0].size.x).toBe(30)
      expect(result.current.scene.parts[1].cuts[0].size.x).toBe(30)
    })
  })

  describe('onRemoveCut', () => {
    it('removes cut from the part', () => {
      const { result } = renderHook(() => useScene())
      const partId = result.current.scene.parts[0].id
      act(() => {
        result.current.onUpdate(partId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_1',
              label: 'Cut 1',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 0 },
              size: { x: 20, y: 20, z: 10 },
            },
          ],
        }))
      })
      act(() => {
        result.current.onRemoveCut(partId, 'cut_1')
      })
      expect(result.current.scene.parts[0].cuts).toHaveLength(0)
    })

    it('clears stale pairedCutId references on other parts', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      act(() => {
        result.current.onUpdate(partAId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_a',
              label: 'A',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
            },
          ],
        }))
        result.current.onUpdate(partBId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_b',
              label: 'B',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
              pairedCutId: `${partAId}:cut_a`,
            },
          ],
        }))
      })

      act(() => {
        result.current.onRemoveCut(partAId, 'cut_a')
      })

      expect(result.current.scene.parts[0].cuts).toHaveLength(0)
      expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBeUndefined()
    })

    it('undo restores cut and paired references in one step', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      act(() => {
        result.current.onUpdate(partAId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_a',
              label: 'A',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
            },
          ],
        }))
        result.current.onUpdate(partBId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_b',
              label: 'B',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
              pairedCutId: `${partAId}:cut_a`,
            },
          ],
        }))
      })

      act(() => {
        result.current.onRemoveCut(partAId, 'cut_a')
      })
      act(() => {
        result.current.undo()
      })

      expect(result.current.scene.parts[0].cuts).toHaveLength(1)
      expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBe(`${partAId}:cut_a`)
    })
  })

  describe('onLinkCuts', () => {
    it('sets pairedCutId bidirectionally', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })

      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id

      act(() => {
        result.current.onUpdate(partAId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_a',
              label: 'A',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 30, y: 40, z: 10 },
            },
          ],
        }))
        result.current.onUpdate(partBId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_b',
              label: 'B',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 10, y: 10, z: 10 },
            },
          ],
        }))
      })

      act(() => {
        result.current.onLinkCuts(partAId, 'cut_a', partBId, 'cut_b')
      })

      expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBe(`${partBId}:cut_b`)
      expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBe(`${partAId}:cut_a`)
      // u/v sizes from A (+Z: u=x, v=y) propagated to B
      expect(result.current.scene.parts[1].cuts[0].size.x).toBe(30)
      expect(result.current.scene.parts[1].cuts[0].size.y).toBe(40)
    })

    it('undo clears both pairedCutIds', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })
      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(partAId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_a',
              label: 'A',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 30, y: 40, z: 10 },
            },
          ],
        }))
        result.current.onUpdate(partBId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_b',
              label: 'B',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 10, y: 10, z: 10 },
            },
          ],
        }))
      })
      act(() => {
        result.current.onLinkCuts(partAId, 'cut_a', partBId, 'cut_b')
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBeUndefined()
      expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBeUndefined()
    })
  })

  describe('onUnlinkCuts', () => {
    it('clears pairedCutId on both sides', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })
      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(partAId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_a',
              label: 'A',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
              pairedCutId: `${partBId}:cut_b`,
            },
          ],
        }))
        result.current.onUpdate(partBId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_b',
              label: 'B',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
              pairedCutId: `${partAId}:cut_a`,
            },
          ],
        }))
      })
      act(() => {
        result.current.onUnlinkCuts(partAId, 'cut_a')
      })
      expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBeUndefined()
      expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBeUndefined()
    })

    it('undo restores both pairedCutIds', async () => {
      const { result } = renderHook(() => useScene())
      await waitFor(() => expect(result.current.occtReady).toBe(true))
      act(() => {
        result.current.onAdd()
      })
      const partAId = result.current.scene.parts[0].id
      const partBId = result.current.scene.parts[1].id
      act(() => {
        result.current.onUpdate(partAId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_a',
              label: 'A',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
              pairedCutId: `${partBId}:cut_b`,
            },
          ],
        }))
        result.current.onUpdate(partBId, (p) => ({
          ...p,
          cuts: [
            {
              id: 'cut_b',
              label: 'B',
              face: '+Z' as const,
              position: { x: 0, y: 0, z: 15 },
              size: { x: 20, y: 20, z: 10 },
              pairedCutId: `${partAId}:cut_a`,
            },
          ],
        }))
      })
      act(() => {
        result.current.onUnlinkCuts(partAId, 'cut_a')
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBe(`${partBId}:cut_b`)
      expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBe(`${partAId}:cut_a`)
    })
  })
})
