# Local revision review notes

- User selected local revision review as the next task. Integrity and comparison remain uncommitted prerequisites on the same branch.
- Review records embed the full comparison so hashes, coverage, definitions, provenance and both output locations travel with acknowledgments.
- Import requires exact comparison equality (object-key order ignored), not only stable references: stable IDs alone would permit stale acknowledgments across revisions.
- All detected changes are available through the review selector even when the comparison preview is capped at 200. No bulk acknowledgment shortcut is provided.
- Records are self-reported, editable and unsigned. The UI never labels them formal production approval or claims full coverage for legacy comparisons.
