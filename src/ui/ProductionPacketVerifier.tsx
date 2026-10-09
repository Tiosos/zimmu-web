import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { downloadBlob } from './download'
import { ProductionReleaseGate } from './ProductionReleaseGate'
import {
  MAX_PACKET_BYTES,
  verifyProductionPacket,
  type PacketIntegrityReport,
} from './verifyProductionPacket'

export function ProductionPacketVerifier({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const alive = useRef(false)
  const heading = useId()
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [packet, setPacket] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState<PacketIntegrityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    alive.current = true
    const node = dialog.current!
    node.showModal()
    return () => {
      alive.current = false
      node.close()
    }
  }, [])
  const verify = async (file: File) => {
    setReport(null)
    setPacket(null)
    setError(null)
    setFileName(file.name)
    setBusy(true)
    try {
      if (file.size > MAX_PACKET_BYTES) throw new Error('Packet exceeds the 64 MiB upload limit.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await verifyProductionPacket(bytes)
      if (alive.current) {
        setReport(result)
        setPacket(bytes)
      }
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : 'The packet could not be read.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onCancel={onClose}
      className="fixed inset-0 m-auto max-h-[85vh] w-[min(900px,94vw)] overflow-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={heading} className="text-lg font-semibold">
          Verify production packet
        </h2>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Check a downloaded packet locally for missing or altered files and inconsistent machining or
        drawing references. Your project is unchanged.
      </p>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium">
        Production packet ZIP
      </label>
      <input
        id={inputId}
        type="file"
        accept=".zip,application/zip"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void verify(file)
        }}
      />
      <div aria-live="polite" className="mt-4">
        {busy && <p>Verifying packet…</p>}
        {error && <p role="alert">Verification could not finish: {error}</p>}
        {report && (
          <>
            <h3 className="font-semibold">
              {report.status === 'passed'
                ? 'Integrity checks passed'
                : report.status === 'failed'
                  ? 'Integrity checks failed'
                  : 'Integrity checks incomplete'}
            </h3>
            <p className="text-sm">
              {fileName}: {report.checkedFiles} files and {report.checkedOperations} operation
              references checked.
            </p>
            <p className="mt-2 text-sm">
              Integrity does not establish fabrication readiness or production approval.
            </p>
            <Button
              className="my-3"
              variant="outline"
              onClick={() =>
                downloadBlob(
                  JSON.stringify(report, null, 2) + '\n',
                  'production-packet-integrity.json',
                  'application/json',
                )
              }
            >
              Download verification report
            </Button>
            {packet && <ProductionReleaseGate packet={packet} />}
            <ul className="space-y-3">
              {report.findings.slice(0, 200).map((finding) => (
                <li key={finding.reference} className="rounded border border-border p-3 text-sm">
                  <p className="font-medium">
                    {finding.severity === 'error' ? 'Failed' : 'Unassessed'}: {finding.message}
                  </p>
                  {finding.partId && (
                    <p>
                      Part: {finding.partId}
                      {finding.operationId && ` · Operation: ${finding.operationId}`}
                    </p>
                  )}
                  <p className="break-all text-muted-foreground">{finding.locations.join(' ↔ ')}</p>
                  <p className="break-all text-xs text-muted-foreground">{finding.reference}</p>
                </li>
              ))}
            </ul>
            {report.findings.length > 200 && (
              <p className="mt-2 text-sm">
                Showing 200 findings. The download contains all {report.findings.length} findings.
              </p>
            )}
            <details className="mt-4 text-sm">
              <summary>Verification scope and limitations</summary>
              <p className="mt-2">{report.scope}</p>
              <ul className="mt-2 list-inside list-disc">
                {report.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </dialog>,
    document.body,
  )
}
