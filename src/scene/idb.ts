import type { MaterialDef } from './types'

const DB_NAME = 'zimmu'
const DB_VERSION = 2
const HANDLES_STORE = 'handles'
const LIBRARY_STORE = 'library'
const KEY = 'last-file'

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(HANDLES_STORE)) db.createObjectStore(HANDLES_STORE)
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) db.createObjectStore(LIBRARY_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function readHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES_STORE, 'readonly').objectStore(HANDLES_STORE).get(KEY)
    req.onsuccess = () => {
      db.close()
      resolve((req.result as FileSystemFileHandle | undefined) ?? null)
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function writeHandle(h: FileSystemFileHandle): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES_STORE, 'readwrite').objectStore(HANDLES_STORE).put(h, KEY)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function clearHandle(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES_STORE, 'readwrite').objectStore(HANDLES_STORE).delete(KEY)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function readLibrary(): Promise<Record<string, MaterialDef>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const result: Record<string, MaterialDef> = {}
    const req = db.transaction(LIBRARY_STORE, 'readonly').objectStore(LIBRARY_STORE).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        result[cursor.key as string] = cursor.value as MaterialDef
        cursor.continue()
      } else {
        db.close()
        resolve(result)
      }
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function writeLibraryEntry(name: string, def: MaterialDef): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(LIBRARY_STORE, 'readwrite').objectStore(LIBRARY_STORE).put(def, name)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function deleteLibraryEntry(name: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(LIBRARY_STORE, 'readwrite').objectStore(LIBRARY_STORE).delete(name)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}
