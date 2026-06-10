import { useState, useEffect, useCallback } from 'react'
import type { MaterialDef } from './types'
import { readLibrary, writeLibraryEntry, deleteLibraryEntry } from './idb'

export interface UseMaterialLibraryResult {
  library: Record<string, MaterialDef>
  saveRate: (name: string, def: MaterialDef) => void
  deleteEntry: (name: string) => void
}

export function useMaterialLibrary(): UseMaterialLibraryResult {
  const [library, setLibrary] = useState<Record<string, MaterialDef>>({})

  useEffect(() => {
    readLibrary()
      .then(setLibrary)
      .catch((err: unknown) => console.error('Failed to load material library:', err))
  }, [])

  const saveRate = useCallback((name: string, def: MaterialDef) => {
    setLibrary((prev) => ({ ...prev, [name]: def }))
    void writeLibraryEntry(name, def).catch((err: unknown) =>
      console.error('Failed to save material library entry:', err),
    )
  }, [])

  const deleteEntry = useCallback((name: string) => {
    setLibrary((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    void deleteLibraryEntry(name).catch((err: unknown) =>
      console.error('Failed to delete material library entry:', err),
    )
  }, [])

  return { library, saveRate, deleteEntry }
}
