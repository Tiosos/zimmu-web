# Production-packet revision comparison

Choose **File → Compare production packets…**, select the earlier and later ZIPs, then **Compare revisions**. Both archives are verified locally before any changes are assessed. Verification failures, unsupported formats and unresolved references block comparison; a blocked report never means that no revisions changed. The open project remains unchanged.

New packets include `machining/parts.json`: a hashed schema-version-1 inventory of every captured part, including hidden parts and parts without operations. It records stable IDs, labels, stock, part-local dimensions, finished/cut board dimensions, grain, edges and provenance. `manifest.partInventory` declares its path, version and count. Integrity checks compare its identities and dimensions to drawing/schedule records where available.

The comparison reports added, removed and modified parts and operations. IDs define identity; changing an ID produces a removal and addition, without guessing from labels. Operation identity is scoped by part ID. Stable `PC:` references do not depend on record order, values or drawing page numbers. Reports retain earlier/later definitions, component/joint ownership, part provenance, schedule JSON entries, logical CSV records and actual drawing pages; absent entities have an explicit null side.

Stock, dimension, grain, edge and operation-definition edits are manufacturing changes. Labels and ownership/provenance edits are metadata changes, retained for review. Manual instructions remain separate from geometric drilling; changes to drilling depth classification are preserved. Counts describe changed entities, so one entity with several changed fields counts once. Changes containing both categories count as manufacturing while retaining each field's classification.

Capture time, project name and source digest differences are listed separately. JSON property order, CSV record order, ZIP compression and drawing page shifts do not create manufacturing changes. Other changed output files are listed **without** assuming they contain only formatting changes: assembly placement, hardware lists, readiness contents and PDF layout are outside this semantic comparison.

Older packets without a declared complete part inventory remain verifiable. Comparisons involving them are explicitly **partial**: part labels/IDs and shared recorded fields are compared, but missing stock/edge details or dimensions for parts with no operations are not assumed unchanged. No missing fields are fabricated as additions.

Download the JSON report for all changes, both input archive SHA-256 digests and full verification findings. The dialog shows up to 200 changes; the download is complete. Integrity extraction limits also apply to each packet. Unsigned manifests provide no proof of authorship or fabrication approval.
