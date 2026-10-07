# Revision review coverage

Extend the local review record to track human review of other changed packet outputs and explicit comparison limitations. Hash-only output changes must not be presented as semantic findings or formatting-only changes. Limitations remain true after acknowledgment, and partial comparisons remain partial.

Schema version 2 adds separate `outputs` and `limitations` acknowledgment arrays, alongside existing `changes`. Each item stores a stable, namespaced reference, acknowledgment boolean and note. Output references encode the exact packet path; limitation references encode the exact statement. The complete comparison retains their labels and both archive hashes.

Import continues to require exact ordered packet hashes and canonical comparison equality. Version 2 requires exact, unique reference sets and valid acknowledgment/note types for all three groups. Version 1 retains valid change progress but initializes every newly introduced item unchecked. Version 1 records carrying unsupported coverage arrays are rejected rather than treating them as authenticated progress.

The UI shows independent counts and expandable output/limitation checklists. Outputs are identified by packet-relative paths, to be inspected in the earlier/later ZIPs; their presence in both archives is not assumed. Notes and acknowledgments travel with downloaded drafts and resume only for the same comparison. No approval/completion gate or production-readiness claim is introduced.

Verify round-trip coverage, reordered imports, legacy migration, duplicate/missing/unknown references, invalid values and mismatched pairs. Exercise save/resume and independent progress in unit and real-archive browser tests. Mutation-test newly added import guards, then restore from backups. Run full unit tests, typecheck, lint and build sequentially.
