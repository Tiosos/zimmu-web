import { REVIEW_STATUS_LABELS } from '../scene/productionReview'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ReadinessSnapshot } from '../scene/readinessSnapshot'

const statuses = {
  straight: 'Straight insertion',
  rotated: 'Angled insertion required',
  unverified: 'No verified insertion route',
  unplaced: 'No valid shelf position generated',
  unassessed: 'Unable to assess',
}
const count = (n: number | null) => (n === null ? 'unknown' : String(n))

export function readinessPdfFilename(projectName: string): string {
  const name = Array.from(projectName, (c) => (c.charCodeAt(0) < 32 ? '_' : c))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 100)
  return `${name || 'project'}-manufacturing-readiness.pdf`
}

export async function buildReadinessPdf(snapshot: ReadinessSnapshot): Promise<Uint8Array> {
  // Own the DTO too, so callers cannot mutate it while fonts/pages are being prepared.
  const report = structuredClone(snapshot)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const supported = new Set(font.getCharacterSet())
  let escaped = false
  const printable = (text: string) =>
    Array.from(text.normalize('NFC'))
      .map((char) => {
        if (char === '\n' || char === '\r' || char === '\t') return ' '
        if (supported.has(char.codePointAt(0)!)) return char
        escaped = true
        return `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`
      })
      .join('')
  const date = new Date(report.capturedAt)
  doc.setTitle(printable(`${report.projectName} - Manufacturing readiness`))
  doc.setCreationDate(date)
  doc.setModificationDate(date)
  doc.setSubject('Advisory production checks from one scene snapshot')
  const width = 595.28,
    height = 841.89,
    margin = 42,
    bottom = 55
  let page = doc.addPage([width, height])
  let y = height - 78
  let currentHeading = ''
  const newPage = () => {
    page = doc.addPage([width, height])
    y = height - 78
  }
  const ensure = (space: number) => {
    if (y - space < bottom) newPage()
  }
  const line = (text: string, heading = false) => {
    const face = heading ? bold : font
    const size = heading ? 12 : 10
    const leading = heading ? 18 : 14
    const words = printable(text).split(/\s+/)
    if (heading) currentHeading = words.join(' ')
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (face.widthOfTextAtSize(candidate, size) <= width - 2 * margin) {
        current = candidate
        continue
      }
      if (current) {
        lines.push(current)
        current = ''
      }
      for (const char of word) {
        if (face.widthOfTextAtSize(current + char, size) > width - 2 * margin) {
          lines.push(current)
          current = ''
        }
        current += char
      }
    }
    if (current) lines.push(current)
    if (heading) ensure(Math.min(lines.length * leading + 28, height - 140))
    for (const textLine of lines) {
      if (y - leading < bottom) {
        newPage()
        if (currentHeading) {
          let continuation = `${currentHeading.slice(0, 72)} (continued)`
          while (bold.widthOfTextAtSize(continuation, 10) > width - 2 * margin)
            continuation = `${continuation.slice(0, -13)}… (continued)`
          page.drawText(continuation, {
            x: margin,
            y,
            size: 10,
            font: bold,
            color: rgb(0.12, 0.16, 0.21),
          })
          y -= 22
        }
      }
      page.drawText(textLine, { x: margin, y, size, font: face, color: rgb(0.12, 0.16, 0.21) })
      y -= leading
    }
    y -= heading ? 5 : 3
  }
  line('Manufacturing readiness', true)
  line(`Project: ${report.projectName}`)
  line(`Snapshot: ${report.capturedAt} (UTC)`)
  line('ADVISORY REPORT - exports remain available. Includes hidden cabinets and boards.')
  line(
    'Scope: cabinet parameters, material thickness, generated parts, joinery and shelf access. Hardware suitability, machining accuracy and physical installation require separate review. Recorded joints do not certify geometry. This document does not update after design changes.',
  )
  line('Production packet review summary', true)
  const review = report.reviewSummary
  line(
    `${REVIEW_STATUS_LABELS[review.status]}: ${review.counts.needsCorrection} need correction; ${review.counts.advisory} advisory; ${review.counts.unassessed} unassessed.`,
  )
  line(review.scope)
  line(review.classification)
  for (const category of ['needs-correction', 'advisory', 'unassessed'] as const) {
    line(
      category === 'needs-correction'
        ? 'Needs correction'
        : category === 'advisory'
          ? 'Advisory findings'
          : 'Unassessed checks',
      true,
    )
    for (const item of review.items.filter((item) => item.category === category)) {
      line(
        `${item.reference} | ${item.source} | ${item.sourceReferences.length ? item.sourceReferences.join(', ') : item.code}`,
      )
      line(item.message)
      for (const target of item.targets) line(`${target.kind}: ${target.label} [${target.id}]`)
      if (item.operationId)
        line(
          `Operation ${item.operationId}; source component ${item.sourceComponentId ?? 'none'}; source joint ${item.sourceJointId ?? 'none'}`,
        )
      item.locations.forEach((location) => line(location))
    }
  }
  line('Project summary', true)
  line(
    `${report.cabinets.length} cabinets; ${report.production.findings.length} production findings; ${count(report.production.intentionalContacts)} intentional contacts. Joinery scan: ${report.production.joineryComplete ? 'complete' : 'incomplete'}.`,
  )
  line(
    'Intentional contacts are not missing joints. Unknown counts and unassessed checks must not be treated as zero issues.',
  )
  const total = (key: 'requested' | 'generated' | 'missing' | 'angled' | 'unverified') => {
    let n = 0
    for (const c of report.cabinets) {
      if (c[key] === null || !Number.isSafeInteger(n + c[key]!)) return null
      n += c[key]!
    }
    return n
  }
  line(
    `Shelves: ${count(total('requested'))} requested; ${count(total('generated'))} generated; ${count(total('missing'))} missing; ${count(total('unverified'))} without a verified route; ${count(total('angled'))} requiring angled insertion.`,
  )
  line('Report limits', true)
  line(
    'Production assessment uses numeric/tree complexity limits and a conservative 200-part budget per cabinet. Scene joinery scanning is skipped above 200 boards; checklist truncation is reported. Detached assemblies are not assessed for generated-part completeness. Shelf detail assessment is limited to 1,000 requested shelves per cabinet and geometry resource limits. This PDF includes all returned findings, including those beyond the dialog display limit; it cannot recover checks skipped by the assessment engines.',
  )
  line(
    'Installation references identify separate installation sheets by cabinet ID and shelf role. They are not embedded in this report PDF. In a production packet, find them in the shop drawings PDF; otherwise open Manufacturing readiness in the matching design and select Installation sheet for that shelf.',
  )
  line('Machining schedule / drawing reconciliation', true)
  const machining = report.machiningReconciliation
  line(
    `${machining.status}; ${machining.compared} operations compared; ${machining.totalFindings} findings.`,
  )
  line(`Not assessed: ${machining.unassessed.join(', ')}.`)
  for (const f of machining.findings) {
    line(`${f.reference} | ${f.kind} | ${f.field}`, true)
    line(
      `Part ${f.partId}; operation ${f.operationId}; source component ${f.sourceComponentId ?? 'none'}; source joint ${f.sourceJointId ?? 'none'}`,
    )
    line(`${f.schedule.location}: ${JSON.stringify(f.schedule.value)}`)
    line(`${f.drawing.location}: ${JSON.stringify(f.drawing.value)}`)
  }
  line('Manufacturing record checks', true)
  line(
    `${report.manufacturing.checkedParts} parts checked; ${report.manufacturing.findings.length} findings.`,
  )
  line(`Not assessed: ${report.manufacturing.unassessed.join(', ')}.`)
  if (!report.manufacturing.findings.length) line('No issues found by these checks.')
  for (const f of report.manufacturing.findings) {
    line(`${f.reference} | ${f.code}`, true)
    line(f.message)
    if (f.operation)
      line(
        `cut: ${f.operation.label} [${f.operation.id}]; kind: ${f.operation.kind}; source component: ${f.operation.sourceComponentId ?? 'none'}; source joint: ${f.operation.sourceJointId ?? 'none'}`,
      )
    for (const t of f.targets)
      line(
        `part: ${t.label} [${t.id}]; cabinet: ${t.cabinetId ?? 'none'}; assembly: ${t.parentId ?? 'none'}`,
      )
  }
  const finding = (f: ReadinessSnapshot['production']['findings'][number]) => {
    line(
      `${f.reference} | ${f.kind === 'unassessed' ? 'NOT ASSESSED' : f.kind.toUpperCase()}`,
      true,
    )
    line(f.message)
    for (const target of f.targets)
      line(`${target.selection.kind}: ${target.label} [${target.selection.id}]`)
  }
  for (const c of report.cabinets) {
    line(`Cabinet: ${c.label}`, true)
    line(`Cabinet ID: ${c.id}`)
    line(
      `Shelves: ${count(c.requested)} requested / ${c.generated} generated / ${count(c.missing)} missing.`,
    )
    const findings = report.production.findings.filter((f) => f.cabinetIds.includes(c.id))
    line(
      `${findings.length} associated production findings (cross-cabinet findings retain the same reference in each cabinet).`,
    )
    findings.forEach(finding)
    c.issues.forEach((issue) => line(`Shelf assessment warning: ${issue}`))
    if (!c.shelves.length)
      line(
        c.missing === null
          ? 'Shelf details unavailable: cabinet not assessed.'
          : 'No adjustable shelves requested.',
      )
    c.shelves.forEach((s, i) => {
      line(`Shelf ${i + 1}: ${s.label}`, true)
      line(`Role: ${s.role}`)
      line(`Generated: ${s.generated ? 'yes' : 'no - omitted'}. Access: ${statuses[s.status]}.`)
      if (!s.generated && (s.status === 'straight' || s.status === 'rotated'))
        line('Route verified, but its board is missing from the scene.')
      line(
        s.installationReference
          ? `Installation sheet reference: ${s.installationReference}`
          : 'No pose available for an installation sheet.',
      )
    })
  }
  const ungrouped = report.production.findings.filter((f) => f.cabinetIds.length === 0)
  if (ungrouped.length) {
    line('Project-wide and loose-part findings', true)
    ungrouped.forEach(finding)
  }
  if (!report.cabinets.length)
    line('No cabinets to assess. Loose-part and project-wide findings, if any, are listed above.')
  if (escaped)
    line(
      'Text encoding note: characters unsupported by the PDF font are preserved as [U+codepoint] references. IDs remain the authoritative item references.',
    )
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawText('MANUFACTURING READINESS  /  ADVISORY', {
      x: margin,
      y: height - 35,
      font: bold,
      size: 9,
      color: rgb(0.25, 0.32, 0.4),
    })
    p.drawLine({
      start: { x: margin, y: height - 46 },
      end: { x: width - margin, y: height - 46 },
      color: rgb(0.75, 0.79, 0.83),
      thickness: 0.5,
    })
    p.drawText(`Snapshot ${report.capturedAt} | Page ${i + 1} of ${pages.length}`, {
      x: margin,
      y: 30,
      font,
      size: 8,
    })
  })
  return doc.save()
}
