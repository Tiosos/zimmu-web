import { Button } from '@/components/ui/button'
import type { Selection } from '../scene/types'
import { FINDING_CAP, type ReconFinding, type ReconResult } from './outputReconciliation'

const statusText: Record<ReconResult['status'], string> = {
  passed: 'Passed: every compared fact agrees',
  failed: 'Failed: the drawings and the cutlist disagree',
  unassessed: 'Not assessed: nothing was comparable',
}

const describeFinding = (f: ReconFinding): string => {
  switch (f.kind) {
    case 'missing-from-drawings':
      return `${f.label}: in the cutlist but has no drawing sheet`
    case 'missing-from-cutlist':
      return `${f.label}: has a drawing sheet but is not in the cutlist`
    case 'duplicate':
      return `${f.label}: appears more than once in the ${f.output}`
    case 'mismatch':
      return f.field === 'kind'
        ? `${f.label}: is a board in one output and a dowel in the other`
        : `${f.label}: ${f.field} differs`
  }
}

export function ReconciliationSection({
  result,
  onInspect,
}: {
  result: ReconResult
  onInspect?: (selection: NonNullable<Selection>) => void
}) {
  return (
    <section aria-label="Drawings and cutlist agreement" className="border rounded p-3 mb-4">
      <h3 className="font-medium">Production packet drawings and lists agree?</h3>
      <p className="text-sm mb-1">
        {statusText[result.status]} · {result.compared} parts compared · {result.totalFindings}{' '}
        findings
      </p>
      <p className="text-xs text-muted-foreground mb-2">
        Compares the built part sheets with the grouped cutlist rows for all parts, hidden ones
        included, as the production packet writes them. A failure means the two builders disagree;
        it does not check the PDF or CSV files themselves. Exports are never blocked.
      </p>
      {result.findings.map((f, i) => (
        <div key={i} className="border-t py-2 text-sm">
          <p>
            <strong>{f.kind === 'mismatch' ? 'Mismatch' : 'Finding'}:</strong> {describeFinding(f)}
          </p>
          {f.left && (
            <p className="text-xs">
              {f.left.source}: {f.left.value}
            </p>
          )}
          {f.right && (
            <p className="text-xs">
              {f.right.source}: {f.right.value}
            </p>
          )}
          {onInspect && f.partId !== '' && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => onInspect({ kind: 'part', id: f.partId })}
            >
              Inspect {f.label}
            </Button>
          )}
        </div>
      ))}
      {result.truncated && (
        <p className="text-amber-300">
          Showing the first {FINDING_CAP} of {result.totalFindings} findings.
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Not compared (never counted as agreement):
      </p>
      <ul className="text-xs list-disc pl-5">
        {result.unassessed.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
