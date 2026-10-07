# Production-packet integrity verification notes

- Verification is a recipient workflow in File, independent of the live scene. Existing packet exports and schema versions are unchanged.
- Hashes alone miss coordinated schedule/index mistakes. Tests update all hashes while deliberately changing identities, CSV record pointers, provenance and actual PDF pages.
- The PDF reader supports the renderer's hex `Tj` strings and WinAnsi fonts, using the renderer's NFC/unsupported-character fallback. Unknown text encoding stays unassessed; no generic PDF text extraction dependency was added.
- Cylinder drilling appears in cut/note labels, unlike board hole-array callouts. Both are valid geometric drilling references. Manual instruction grouping is checked separately.
- The uploaded manifest cannot authenticate itself. Source digest verification and regeneration of readiness/board/dowel/hardware facts are deliberately outside the report's documented scope.
- Resource caps apply before ZIP file allocation and while streaming PDF decompression. No user-controlled paths reach the filesystem. Findings retain identity across changed values and use both schedule and drawing/CSV locations where relevant.
