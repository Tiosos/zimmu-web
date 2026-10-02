import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  MAX_CATALOGUE_BYTES,
  parseCataloguePackage,
  type CataloguePackage,
} from '../scene/cataloguePackage'
import type { Scene } from '../scene/types'

export function CatalogueImport({
  scene,
  onInstall,
  onClose,
}: {
  scene: Scene
  onInstall: (pkg: CataloguePackage, source: Scene) => boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const generation = useRef(0)
  const [selection, setLoaded] = useState<{ pkg: CataloguePackage; source: Scene } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busySource, setBusy] = useState<Scene | null>(null)
  const [failure, setFailure] = useState<{ source: Scene; message: string } | null>(null)
  const loaded = selection?.source === scene ? selection : null
  const busy = busySource === scene
  const error = failure?.source === scene ? failure.message : ''
  const setError = (message: string) => setFailure(message ? { source: scene, message } : null)
  useEffect(() => {
    const requestGeneration = generation
    dialog.current?.showModal()
    return () => {
      requestGeneration.current++
    }
  }, [])
  useEffect(() => {
    generation.current++
  }, [scene])
  async function read(file: File) {
    const request = ++generation.current
    setLoaded(null)
    setConfirmed(false)
    setError('')
    setBusy(scene)
    try {
      if (file.size > MAX_CATALOGUE_BYTES) throw new Error('Catalogue package exceeds 2 MiB.')
      const pkg = await parseCataloguePackage(await file.text())
      if (request === generation.current) setLoaded({ pkg, source: scene })
    } catch (failure) {
      if (request === generation.current)
        setError(failure instanceof Error ? failure.message : 'Could not read catalogue package.')
    } finally {
      if (request === generation.current) setBusy(null)
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-labelledby="import-catalogue-title"
      className="bg-background text-foreground border border-border rounded-lg p-5 w-[min(720px,95vw)] max-h-[90vh] backdrop:bg-black/60"
    >
      <div className="space-y-3">
        <h2 id="import-catalogue-title" className="text-lg font-semibold">
          Import company catalogue
        </h2>
        <p className="text-sm">
          Choose the catalogue package exported by your company. It will be stored in this project
          for offline use. Existing cabinets stay unchanged.
        </p>
        <input
          aria-label="Company catalogue package"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void read(file)
          }}
        />
        {busy && <p role="status">Checking catalogue content and dependencies…</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {loaded && (
          <>
            <p className="text-sm break-all">Company: {loaded.pkg.companyId}</p>
            <ul className="text-sm space-y-2 max-h-60 overflow-auto">
              {loaded.pkg.versions.map((v) => (
                <li key={`${v.kind}:${v.definitionId}:${v.version}`}>
                  {v.content.name} · {v.kind} · {v.definitionId} v{v.version}
                  <br />
                  <span className="break-all">
                    Approval record: {v.approvedBy} · {v.publishedAt}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Content hashes match. Offline files cannot authenticate their sender or approval
              records. Catalogue approval does not release work for production.
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I obtained this package from my company and want to install these versions in this
              project.
            </label>
            <Button
              disabled={!confirmed || busy}
              onClick={() => {
                try {
                  if (!onInstall(loaded.pkg, loaded.source)) {
                    setLoaded(null)
                    setConfirmed(false)
                    setError('The project changed. Select the package again before importing.')
                    return
                  }
                  onClose()
                } catch (failure) {
                  setError(
                    failure instanceof Error ? failure.message : 'Could not install catalogue.',
                  )
                }
              }}
            >
              Install catalogue in project
            </Button>
          </>
        )}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </dialog>
  )
}
