# Manufacturing readiness printable report

## Scope

Export an advisory A4 PDF from Manufacturing readiness. Capture a structured clone of the scene
and project name at click time. Derive production findings and shelf access from that clone. Include
hidden cabinets and boards, stable cabinet/part IDs, finding references, project totals, per-cabinet
findings and shelf routes, separate installation sheet references, and explicit skipped checks and
report limits. Keep exports available and avoid saving the PDF to the project or editing the scene.

## Rendering

Use the app's existing pdf-lib dependency, with a repeatable header/footer and page numbering.
Wrap long values by measured font width, including uninterrupted IDs or labels. Keep headings with
their following text when possible and label pages continuing a long finding. The embedded standard
font supports a limited character set; unsupported user characters are preserved as explicit
`[U+codepoint]` references with an encoding note, never silently dropped or allowed to abort export.
Print snapshot time in UTC and mark that the document does not update with later edits.

## Validation

Model/PDF tests verify snapshot isolation, stable references, missing/unknown totals, all findings
beyond dialog display limit, multi-page wrapping, Unicode fallback, empty projects and safe names.
UI tests verify download and error recovery. Browser E2E checks a real PDF download while keeping
the report open, plus existing preview, sheet and export flows. Inspect rendered short and long
sample pages before review; run full unit suite, typecheck, lint, build and GitHub E2E.
