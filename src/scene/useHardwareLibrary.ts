import { useState, useEffect, useCallback } from 'react'
import type { HardwareLibraryEntry } from './types'
import { readHardwareLibrary, writeHardwareEntry, deleteHardwareEntry } from './idb'

export interface UseHardwareLibraryResult {
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  saveHardwareEntry: (key: string, entry: HardwareLibraryEntry) => void
  deleteHardwareEntry: (key: string) => void
}

// The mirror of `useMaterialLibrary`, against the store beside it: a hinge is priced once and that
// price outlives the file it was first typed into.
export function useHardwareLibrary(): UseHardwareLibraryResult {
  const [hardwareLibrary, setHardwareLibrary] = useState<Record<string, HardwareLibraryEntry>>({})

  useEffect(() => {
    readHardwareLibrary()
      .then(setHardwareLibrary)
      .catch((err: unknown) => console.error('Failed to load hardware library:', err))
  }, [])

  const saveHardwareEntry = useCallback((key: string, entry: HardwareLibraryEntry) => {
    setHardwareLibrary((prev) => ({ ...prev, [key]: entry }))
    void writeHardwareEntry(key, entry).catch((err: unknown) =>
      console.error('Failed to save hardware library entry:', err),
    )
  }, [])

  const removeEntry = useCallback((key: string) => {
    setHardwareLibrary((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    void deleteHardwareEntry(key).catch((err: unknown) =>
      console.error('Failed to delete hardware library entry:', err),
    )
  }, [])

  return { hardwareLibrary, saveHardwareEntry, deleteHardwareEntry: removeEntry }
}
