# Identify downloaded packet comparisons

Name comparison JSON downloads production-packet-comparison-<later-project>-<earlier-hash>-to-<later-hash>. Share the existing project normalization, safe character handling, length bound and ordered hash-prefix logic with revision review downloads. Preserve every existing review filename.

Rename the internal helper module to productionPacketReportFilename to reflect both consumers. Keep dedicated exports for comparison JSON and review JSON/HTML so callers cannot confuse report kinds. The report content and comparison status remain unchanged. Blocked comparisons can still be downloaded, using unavailable for missing or invalid hashes and project for absent names; names do not imply integrity success.

Verify comparison identities, matching review identity suffixes, blocked/missing metadata, UI filename binding and real browser-suggested names. Retain existing Unicode, unsafe-name and length checks. Mutation-test download wiring, then run repository checks before publication.
