import {
  importRevisionReview,
  revisionReviewCoverage,
  type ReviewAcknowledgment,
  type RevisionReviewRecord,
} from './packetRevisionReview'
import type { RevisionLocation } from './compareProductionPackets'

const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  )
const value = (input: unknown) =>
  escape(typeof input === 'object' ? JSON.stringify(input, null, 2) : input)
const note = (text: string) => `<p class="note">${escape(text || 'No note recorded.')}</p>`
const pendingFirst = (entries: ReviewAcknowledgment[]) =>
  [...entries].sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged))
const status = (item: ReviewAcknowledgment) => (item.acknowledged ? 'Acknowledged' : 'Pending')
const locations = (side: RevisionLocation | null) =>
  side
    ? `<ul>${side.locations.map((path) => `<li>${escape(path)}</li>`).join('')}</ul><p>Provenance</p><pre>${value(side.provenance)}</pre>`
    : '<p>Absent in this revision.</p>'

export function buildRevisionReviewHtml(input: RevisionReviewRecord): string {
  // Validate and normalize the record so mismatched progress cannot create a misleading summary.
  const review = importRevisionReview(input, input.comparison),
    report = review.comparison
  const coverage = revisionReviewCoverage(report)
  const changes = new Map(report.changes.map((change) => [change.reference, change]))
  const count = (label: string, entries: ReviewAcknowledgment[]) => {
    const acknowledged = entries.filter((entry) => entry.acknowledged).length
    return `<tr><th scope="row">${label}</th><td>${acknowledged}</td><td>${entries.length - acknowledged}</td><td>${entries.length}</td></tr>`
  }
  const coverageSection = (
    group: 'outputs' | 'limitations',
    heading: string,
    description: string,
  ) => {
    const labels = new Map(coverage[group].map((target) => [target.reference, target.label]))
    return `<section><h2>${heading}</h2><p>${description}</p>${
      pendingFirst(review[group])
        .map(
          (item) =>
            `<article><h3>${status(item)} — ${escape(labels.get(item.reference))}</h3><p class="reference">${escape(item.reference)}</p>${note(item.note)}</article>`,
        )
        .join('') || '<p>No items in this group.</p>'
    }</section>`
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Production packet revision review</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;color:#18212b;max-width:1000px;margin:32px auto;padding:0 24px}h1,h2,h3{line-height:1.25}h2{border-bottom:1px solid #aaa;padding-bottom:8px}article{border:1px solid #bbb;padding:12px;margin:12px 0}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}p,li,td,th{overflow-wrap:anywhere}.note,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre,.reference{font-size:12px}pre{font-family:ui-monospace,monospace}.notice{border-left:4px solid #555;padding-left:12px}@page{margin:15mm}@media print{body{margin:0;padding:0;max-width:none;font-size:10pt}h2,h3{break-after:avoid}thead{display:table-header-group}article{box-decoration-break:clone}}
</style></head><body>
<h1>Production packet revision review</h1>
<p class="notice">Local, unsigned, self-reported review. This is not production approval. Acknowledging limitations does not resolve them or expand coverage.</p>
<p>Snapshot generated at: ${escape(review.savedAt)}<br>Reviewer (self-reported): ${escape(review.reviewer || 'Not supplied')}</p>
<p>Comparison coverage: ${report.status === 'partial' ? 'Partial — missing fields were not assumed unchanged, even when all items are acknowledged.' : 'Recorded part and operation comparison only; see limitations below.'}</p>
<table><thead><tr><th>Packet</th><th>Project / capture time</th><th>Archive SHA-256</th></tr></thead><tbody>${(['before', 'after'] as const).map((side) => `<tr><th scope="row">${side === 'before' ? 'Earlier' : 'Later'}</th><td>${escape(report[side].projectName)}<br>${escape(report[side].capturedAt)}</td><td>${escape(report[side].sha256)}</td></tr>`).join('')}</tbody></table>
<h2>Review progress</h2><table><thead><tr><th>Group</th><th>Acknowledged</th><th>Pending</th><th>Total</th></tr></thead><tbody>${count('Detected changes', review.changes)}${count('Other changed outputs', review.outputs)}${count('Comparison limitations', review.limitations)}</tbody></table>
<p>Counts describe recorded items only. Zero pending items does not establish production readiness. Pending items appear first in each group.</p>
<h2>Overall review notes</h2>${note(review.notes)}
${report.packetMetadataChanges.length ? `<h2>Packet metadata changes</h2><ul>${report.packetMetadataChanges.map((field) => `<li>${escape(field)}</li>`).join('')}</ul>` : ''}
<section><h2>Detected changes</h2>${
    pendingFirst(review.changes)
      .map((item) => {
        const change = changes.get(item.reference)!
        return `<article><h3>${status(item)} — ${escape(change.change)} ${escape(change.entity)}: ${escape(change.label)}</h3><p>${escape(change.classification)} · Part: ${escape(change.partId)}${change.operationId ? ` · Operation: ${escape(change.operationId)}` : ''}</p><p class="reference">${escape(item.reference)}</p>${note(item.note)}
<h4>Earlier output locations</h4>${locations(change.before)}<h4>Later output locations</h4>${locations(change.after)}
${change.fields.length ? `<table><thead><tr><th>Field / classification</th><th>Earlier</th><th>Later</th></tr></thead><tbody>${change.fields.map((field) => `<tr><th scope="row">${escape(field.field)} (${escape(field.classification)})</th><td><pre>${value(field.before)}</pre></td><td><pre>${value(field.after)}</pre></td></tr>`).join('')}</tbody></table>` : `<h4>Earlier definition</h4><pre>${value(change.before?.definition ?? 'Absent')}</pre><h4>Later definition</h4><pre>${value(change.after?.definition ?? 'Absent')}</pre>`}</article>`
      })
      .join('') || '<p>No detected changes. This does not establish production readiness.</p>'
  }</section>
${coverageSection('outputs', 'Other changed outputs', 'Inspect these paths in the earlier and later archives. A path may exist in only one revision. These files were not semantically compared.')}
${coverageSection('limitations', 'Comparison limitations', 'These limitations remain in effect after acknowledgment.')}
<p>Open this file in a browser and use Print to print or save a PDF. Keep the JSON review record to resume editing; this HTML is a readable snapshot.</p>
</body></html>\n`
}
