# Drawing references in production packets

Part-sheet title blocks print `Part ID`. Geometric cut annotations print `[operation ID]` alongside their dimensions or angles. Drilling callouts print `Drilling [operation ID]`; manual notes print `Manual instruction [member operation IDs]`, retaining the template, instruction and grouped positions. IDs identify nominal definitions; printing a reference does not turn manual instructions into modeled drilling or certify geometry. PDF, SVG and DXF use the same reference formatting.

Packets include hashed `machining/drawing-index.json` and `machining/drawing-index.csv`. `manifest.drawingReferences` names these files and summarizes part-sheet, operation, referenced, missing and ambiguous counts.

JSON schema version 1 contains:

- `parts`: every built part sheet, including hidden parts and parts without operations, with part ID, label and actual PDF page.
- `entries`: one entry per captured schedule row. Each retains part/operation IDs and labels, category, component/joint provenance and part manufacturing provenance. The schedule location identifies its JSON entry and CSV record; the drawing location identifies its part pages and every printed annotation's page, view, type and index.
- `counts` and `scope`: explicit reference coverage and indexing conventions.

Operation identity is **part ID plus operation ID**. Repeated IDs on different parts remain separate. A hole array stays one schedule/index entry rather than expanding into per-hole rows. Each manual operation retains its own schedule record even when several operations share one printed shop note. Multiple view annotations can legitimately locate one operation.

PDF page numbers are one-based and include cover, assembly, elevation and installation sheets before the part sheets. JSON entry and annotation indexes are zero-based. CSV record numbers are one-based, including the header: record 2 is the first operation. Record numbers describe spreadsheet rows, not physical text-file lines; quoted multiline instructions can span several lines.

`status` is `referenced`, `missing-from-drawings` or `ambiguous`. Missing annotations retain empty locations; duplicate part sheets, schedule identities or repeated annotations retain all candidate locations and remain ambiguous. These are location statuses, not machining-validation results; use the reconciliation and review reports to assess mismatched facts. Exports remain available.

All index data comes from the same captured schedule and built drawing set as the exported files, before asynchronous PDF work. The JSON/CSV index hashes are recorded in the manifest. Unsupported PDF characters retain the existing explicit `[U+codepoint]` fallback, and the diameter symbol prints as `DIA`. Nominal geometry, cut interactions and annotation layout still require review.
