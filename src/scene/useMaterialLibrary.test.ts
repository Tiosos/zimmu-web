import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMaterialLibrary } from './useMaterialLibrary'
import { readLibrary, writeLibraryEntry, openDb } from './idb'
import type { MaterialDef } from './types'

async function clearLibrary() {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction('library', 'readwrite').objectStore('library').clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  db.close()
}

describe('useMaterialLibrary', () => {
  beforeEach(async () => {
    await clearLibrary()
  })

  it('initial state is {}', () => {
    const { result } = renderHook(() => useMaterialLibrary())
    expect(result.current.library).toEqual({})
  })

  it('loads library from IDB on mount', async () => {
    await writeLibraryEntry('oak', { costPerM2: 80 })
    const { result } = renderHook(() => useMaterialLibrary())
    await waitFor(() => {
      expect(result.current.library['oak']).toEqual({ costPerM2: 80 })
    })
  })

  it('saveRate updates state optimistically', async () => {
    const { result } = renderHook(() => useMaterialLibrary())
    const def: MaterialDef = { costPerM2: 45 }
    act(() => {
      result.current.saveRate('birch ply', def)
    })
    expect(result.current.library['birch ply']).toEqual(def)
  })

  it('saveRate persists to IDB', async () => {
    const { result } = renderHook(() => useMaterialLibrary())
    act(() => {
      result.current.saveRate('birch ply', { costPerM2: 45 })
    })
    await waitFor(async () => {
      const stored = await readLibrary()
      expect(stored['birch ply']).toEqual({ costPerM2: 45 })
    })
  })

  it('deleteEntry removes from state', async () => {
    const { result } = renderHook(() => useMaterialLibrary())
    act(() => {
      result.current.saveRate('pine', { costPerM2: 30 })
    })
    act(() => {
      result.current.deleteEntry('pine')
    })
    expect(result.current.library['pine']).toBeUndefined()
  })

  it('deleteEntry removes from IDB', async () => {
    await writeLibraryEntry('pine', { costPerM2: 30 })
    const { result } = renderHook(() => useMaterialLibrary())
    await waitFor(() => {
      expect(result.current.library['pine']).toBeDefined()
    })
    act(() => {
      result.current.deleteEntry('pine')
    })
    await waitFor(async () => {
      const stored = await readLibrary()
      expect(stored['pine']).toBeUndefined()
    })
  })
})
