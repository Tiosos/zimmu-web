import { describe, it, expect, beforeEach } from 'vitest'
import {
  readHandle,
  writeHandle,
  clearHandle,
  readLibrary,
  writeLibraryEntry,
  deleteLibraryEntry,
  openDb,
} from './idb'
import type { MaterialDef } from './types'

describe('idb', () => {
  beforeEach(async () => {
    await clearHandle()
  })

  it('readHandle returns null when nothing is stored', async () => {
    const result = await readHandle()
    expect(result).toBeNull()
  })

  it('writeHandle stores a handle that readHandle retrieves', async () => {
    const mockHandle = { name: 'test.zimmu' } as unknown as FileSystemFileHandle
    await writeHandle(mockHandle)
    const result = await readHandle()
    expect(result).toStrictEqual(mockHandle)
  })

  it('clearHandle removes the stored handle', async () => {
    const mockHandle = { name: 'test.zimmu' } as unknown as FileSystemFileHandle
    await writeHandle(mockHandle)
    await clearHandle()
    const result = await readHandle()
    expect(result).toBeNull()
  })
})

describe('library store', () => {
  beforeEach(async () => {
    // Clear library between tests using a direct IDB transaction
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction('library', 'readwrite').objectStore('library').clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    db.close()
  })

  it('readLibrary returns {} on empty store', async () => {
    const result = await readLibrary()
    expect(result).toEqual({})
  })

  it('writeLibraryEntry + readLibrary round-trips', async () => {
    const def: MaterialDef = { costPerM2: 45 }
    await writeLibraryEntry('birch ply', def)
    const result = await readLibrary()
    expect(result['birch ply']).toEqual(def)
  })

  it('writeLibraryEntry overwrites existing entry', async () => {
    await writeLibraryEntry('oak', { costPerM2: 80 })
    await writeLibraryEntry('oak', { costPerM2: 95 })
    const result = await readLibrary()
    expect(result['oak']).toEqual({ costPerM2: 95 })
  })

  it('deleteLibraryEntry removes the entry', async () => {
    await writeLibraryEntry('pine', { costPerM2: 30 })
    await deleteLibraryEntry('pine')
    const result = await readLibrary()
    expect(result['pine']).toBeUndefined()
  })

  it('deleteLibraryEntry is a no-op for non-existent key', async () => {
    await expect(deleteLibraryEntry('nope')).resolves.toBeUndefined()
  })

  it('readLibrary returns all entries', async () => {
    await writeLibraryEntry('A', { costPerM2: 10 })
    await writeLibraryEntry('B', { costPerM2: 20 })
    const result = await readLibrary()
    expect(result).toEqual({ A: { costPerM2: 10 }, B: { costPerM2: 20 } })
  })
})

describe('db v1 → v2 upgrade', () => {
  it('adds library store while preserving handles store', async () => {
    // Reset to a clean state, then recreate as v1
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('zimmu')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('zimmu', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('handles')
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })

    // openDb() triggers the v2 upgrade
    const db = await openDb()
    expect(db.objectStoreNames.contains('handles')).toBe(true)
    expect(db.objectStoreNames.contains('library')).toBe(true)
    db.close()
  })
})
