import { useState, useEffect, useCallback } from 'react'
import type { MaterialDef } from './types'
import {
  readLibrary,
  writeLibraryEntry,
  deleteLibraryEntry,
  readClearance,
  writeClearance,
  DEFAULT_CLEARANCE,
} from './idb'

export interface UseMaterialLibraryResult {
  library: Record<string, MaterialDef>
  clearance: number
  saveRate: (name: string, def: MaterialDef) => void
  deleteEntry: (name: string) => void
  setClearance: (mm: number) => void
}

export function useMaterialLibrary(): UseMaterialLibraryResult {
  const [library, setLibrary] = useState<Record<string, MaterialDef>>({})
  const [clearance, setClearanceState] = useState(DEFAULT_CLEARANCE)

  useEffect(() => {
    readLibrary()
      .then(setLibrary)
      .catch((err: unknown) => console.error('Failed to load material library:', err))
    readClearance()
      .then(setClearanceState)
      .catch((err: unknown) => console.error('Failed to load tool clearance:', err))
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

  const setClearance = useCallback((mm: number) => {
    setClearanceState(mm)
    void writeClearance(mm).catch((err: unknown) =>
      console.error('Failed to save tool clearance:', err),
    )
  }, [])

  return { library, clearance, saveRate, deleteEntry, setClearance }
}
