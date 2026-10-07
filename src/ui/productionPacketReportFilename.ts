import type { PacketRevisionReport } from './compareProductionPackets'

function packetPairFilename(report: PacketRevisionReport): string {
  const project =
    Array.from(
      (report.after.projectName ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, ''),
    )
      .slice(0, 40)
      .join('')
      .replace(/-+$/g, '') || 'project'
  const hash = (sha256: string | null) =>
    sha256 && /^[a-f0-9]{64}$/i.test(sha256) ? sha256.slice(0, 12).toLowerCase() : 'unavailable'
  return `${project}-${hash(report.before.sha256)}-to-${hash(report.after.sha256)}`
}

export function revisionReviewFilename(
  report: PacketRevisionReport,
  extension: 'json' | 'html',
): string {
  return `production-packet-revision-review-${packetPairFilename(report)}.${extension}`
}

export function comparisonReportFilename(report: PacketRevisionReport): string {
  return `production-packet-comparison-${packetPairFilename(report)}.json`
}
