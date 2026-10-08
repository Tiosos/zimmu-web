import type { PacketRevisionReport } from '../compareProductionPackets'

export function comparisonFixture(): PacketRevisionReport {
  const side = (sha256: string) => ({
    sha256,
    projectName: 'Project',
    capturedAt: 'date',
    integrity: {
      schemaVersion: 1 as const,
      status: 'passed' as const,
      checkedFiles: 14,
      checkedOperations: 1,
      findings: [],
      scope: 'scope',
      limitations: [],
    },
  })
  return {
    schemaVersion: 1,
    status: 'compared',
    before: side('a'.repeat(64)),
    after: side('b'.repeat(64)),
    counts: { added: 0, removed: 0, modified: 1, manufacturing: 1, metadata: 0 },
    packetMetadataChanges: [],
    otherChangedFiles: ['drawings/shop-drawings.pdf'],
    limitations: ['Unsigned packets'],
    changes: [
      {
        reference: 'PC:part',
        entity: 'part',
        partId: 'part',
        operationId: null,
        label: 'Board',
        change: 'modified',
        classification: 'manufacturing',
        fields: [{ field: 'dimensions', classification: 'manufacturing', before: 600, after: 720 }],
        before: {
          locations: ['earlier.pdf#page=1'],
          provenance: { cabinetId: 'cabinet' },
          definition: { length: 600 },
        },
        after: {
          locations: ['later.pdf#page=2'],
          provenance: { cabinetId: 'cabinet' },
          definition: { length: 720 },
        },
      },
    ],
  }
}

export function perPartComparisonFixture(): PacketRevisionReport {
  const report = comparisonFixture(),
    part = report.changes[0]
  report.changes = [
    {
      ...part,
      reference: 'PC:manual',
      entity: 'operation',
      operationId: 'manual',
      label: 'Drill on site',
      fields: [],
      before: null,
      after: { ...part.after!, definition: { kind: 'manual', instruction: 'Drill on site' } },
    },
    part,
    { ...part, reference: 'PC:other-part', partId: 'other-part', classification: 'metadata' },
    {
      ...part,
      reference: 'PC:operation-only',
      entity: 'operation',
      partId: 'operation-only',
      operationId: 'geometric',
      label: 'Geometric drilling',
    },
  ]
  return report
}
