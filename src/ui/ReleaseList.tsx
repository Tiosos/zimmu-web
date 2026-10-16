import { Button } from '@/components/ui/button'
import {
  isReadable,
  type ProductionRelease,
  type ReleaseEntry,
  type ReleaseIntegrity,
} from '../scene/releases'

const INTEGRITY_TEXT: Record<ReleaseIntegrity, string> = {
  ok: 'Integrity check passed',
  corrupted: 'Integrity check failed: the stored snapshot differs from its recorded hash',
  unreadable: 'Unreadable entry, preserved in the file as read',
}

export function ReleaseList({
  releases,
  integrity,
  onCompare,
}: {
  releases: readonly ReleaseEntry[]
  integrity: readonly ReleaseIntegrity[] | null
  onCompare?: (release: ProductionRelease) => void
}) {
  if (releases.length === 0) return null
  const newest = Math.max(0, ...releases.filter(isReadable).map((release) => release.revision))
  const rows = releases.map((entry, index) => ({ entry, status: integrity?.[index] })).reverse()
  return (
    <section aria-label="Recorded releases" className="my-4 rounded border p-3">
      <h3 className="font-semibold">Recorded releases</h3>
      <p className="text-sm">
        Recorded in this project file. A record is not formal approval, and the releasing name is
        typed by the user and unverified. The integrity check detects accidental corruption only.
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.map(({ entry, status }, position) => (
          <li
            key={isReadable(entry) ? entry.id : `unreadable-${position}`}
            className="border-t pt-2"
          >
            {isReadable(entry) ? (
              <>
                <p className="font-medium">
                  Revision {entry.revision} ·{' '}
                  {entry.revision === newest ? 'Latest recorded' : 'Superseded'}
                </p>
                <p>
                  {entry.releasedBy} (self-declared, unverified) · {entry.releasedAt}
                </p>
                <p className="break-all">Packet {entry.packetSha256.slice(0, 12)}</p>
                {status === 'ok' && onCompare && (
                  <Button
                    variant="outline"
                    aria-label={`Compare current design with revision ${entry.revision}`}
                    onClick={() => onCompare(entry)}
                  >
                    Compare with this release
                  </Button>
                )}
                <p>Snapshot {Math.max(1, Math.round(entry.source.length / 1024))} KiB</p>
              </>
            ) : null}
            <p>
              {isReadable(entry)
                ? status === undefined
                  ? 'Checking integrity…'
                  : INTEGRITY_TEXT[status]
                : INTEGRITY_TEXT.unreadable}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
