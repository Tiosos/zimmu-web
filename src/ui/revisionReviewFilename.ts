import type { PacketRevisionReport } from './compareProductionPackets'

export function revisionReviewFilename(
  report: PacketRevisionReport,
  extension: 'json' | 'html',
): string {
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
  return `production-packet-revision-review-${project}-${hash(report.before.sha256)}-to-${hash(report.after.sha256)}.${extension}`
}
