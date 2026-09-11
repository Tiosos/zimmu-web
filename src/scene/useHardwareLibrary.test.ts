import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useHardwareLibrary } from './useHardwareLibrary'
import { readHardwareLibrary, writeHardwareEntry, openDb } from './idb'

async function clearHardwareLibrary() {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction('hardware', 'readwrite').objectStore('hardware').clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  db.close()
}

describe('useHardwareLibrary', () => {
  beforeEach(async () => {
    await clearHardwareLibrary()
  })

  it('saves an entry to state and to the store', async () => {
    const { result } = renderHook(() => useHardwareLibrary())
    act(() => {
      result.current.saveHardwareEntry('hinge-overlay', {
        supplier: 'Blum',
        partNumber: '71B3550',
        unitCost: 3.4,
      })
    })
    expect(result.current.hardwareLibrary['hinge-overlay'].unitCost).toBe(3.4)
    await waitFor(async () => {
      expect((await readHardwareLibrary())['hinge-overlay']?.unitCost).toBe(3.4)
    })
  })

  it('deletes an entry from state and from the store', async () => {
    const { result } = renderHook(() => useHardwareLibrary())
    act(() => {
      result.current.saveHardwareEntry('screw-8x40', {
        supplier: '',
        partNumber: '',
        unitCost: 0.03,
      })
    })
    await waitFor(async () => {
      expect((await readHardwareLibrary())['screw-8x40']).toBeDefined()
    })
    act(() => {
      result.current.deleteHardwareEntry('screw-8x40')
    })
    expect(result.current.hardwareLibrary['screw-8x40']).toBeUndefined()
    await waitFor(async () => {
      expect((await readHardwareLibrary())['screw-8x40']).toBeUndefined()
    })
  })

  it('loads existing entries from the store on mount', async () => {
    await writeHardwareEntry('slide-full-ext', {
      supplier: 'Blum',
      partNumber: '563.5500B',
      unitCost: 12.5,
    })
    const { result } = renderHook(() => useHardwareLibrary())
    await waitFor(() => {
      expect(result.current.hardwareLibrary['slide-full-ext']?.unitCost).toBe(12.5)
    })
  })
})
