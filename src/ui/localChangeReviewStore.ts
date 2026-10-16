export const LOCAL_CHANGE_REVIEW_DB = 'zimmu-review-drafts'
export const MAX_LOCAL_CHANGE_REVIEWS = 10
const STORE = 'drafts'

export interface LocalChangeReviewRecord {
  schemaVersion: 1
  key: string
  fingerprint: string
  updatedAt: string
  review: {
    reviewer: string
    notes: string
    entries: { reference: string; reviewed: boolean; note: string }[]
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false
    const request = indexedDB.open(LOCAL_CHANGE_REVIEW_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onerror = () =>
      reject(request.error ?? new Error('Local review storage is unavailable.'))
    request.onblocked = () => {
      abandoned = true
      reject(new Error('Local review storage is blocked by another window.'))
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      if (abandoned) db.close()
      else resolve(db)
    }
  })
}
// Writes continue after a dialog closes. Reads wait for them so reopening immediately cannot
// restore the previous checkpoint. Serialisation also prevents old saves overtaking newer edits.
let writes: Promise<void> = Promise.resolve()
export async function readLocalChangeReview(key: string): Promise<unknown | null> {
  await writes
  const db = await open()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(key)
      let value: unknown = null
      request.onsuccess = () => {
        value = request.result ?? null
      }
      tx.oncomplete = () => {
        db.close()
        resolve(value)
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Local draft read failed.'))
      }
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}
async function write(record: LocalChangeReviewRecord): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.getAll()
      request.onsuccess = () => {
        try {
          const others = (request.result as LocalChangeReviewRecord[])
            .filter((entry) => entry.key !== record.key)
            .sort(
              (a, b) =>
                String(b.updatedAt).localeCompare(String(a.updatedAt)) ||
                String(a.key).localeCompare(String(b.key)),
            )
          store.put(record)
          for (const stale of others.slice(MAX_LOCAL_CHANGE_REVIEWS - 1)) store.delete(stale.key)
        } catch {
          tx.abort()
        }
      }
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Local draft write failed.'))
      }
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}
export function writeLocalChangeReview(record: LocalChangeReviewRecord): Promise<void> {
  const captured = structuredClone(record)
  const next = writes.then(() => write(captured))
  writes = next.catch(() => {})
  return next
}
