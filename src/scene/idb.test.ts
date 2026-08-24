import { describe, it, expect, beforeEach } from 'vitest'
import {
  readHandle,
  writeHandle,
  clearHandle,
  readLibrary,
  writeLibraryEntry,
  deleteLibraryEntry,
  openDb,
  readClearance,
  writeClearance,
  DEFAULT_CLEARANCE,
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

describe('idb v2 → v3', () => {
  // An onupgradeneeded that drops a store is silent data loss, and it is the exact failure a
  // version bump invites. Opening the old schema by hand is the only way to prove the upgrade path
  // rather than the already-upgraded steady state.
  it('upgrades a v2 database to v3 without losing its library entries', async () => {
    indexedDB.deleteDatabase('zimmu')
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('zimmu', 2)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('handles')
        req.result.createObjectStore('library')
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('library', 'readwrite')
        tx.objectStore('library').put({ costPerM2: 42 }, 'Survivor')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })

    const db = await openDb()
    const names = Array.from(db.objectStoreNames)
    db.close()
    expect(names).toContain('settings')

    expect((await readLibrary()).Survivor).toEqual({ costPerM2: 42 })
  })
})

describe('clearance', () => {
  it('returns the default when none was ever written', async () => {
    indexedDB.deleteDatabase('zimmu')
    expect(await readClearance()).toBe(DEFAULT_CLEARANCE)
  })

  it('reads back a clearance it wrote', async () => {
    await writeClearance(9)
    expect(await readClearance()).toBe(9)
  })
})
