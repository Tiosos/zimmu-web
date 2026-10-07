# Identify downloaded revision reviews

Give JSON and printable HTML review downloads the same descriptive stem: production-packet-revision-review-<later-project>-<earlier-hash>-to-<later-hash>. Use the later project name, including when it differs from the earlier one. Normalize it with NFKC, retain Unicode letters/numbers separated by hyphens, lowercase, and limit to 40 code points. Use project when the sanitized name is empty. The fixed prefix prevents reserved device filenames and dotfile names.

Use the first 12 lowercase hexadecimal characters of each valid archive SHA-256, preserving earlier/later order. Use unavailable for missing/invalid hashes rather than turning arbitrary input into a filename. Prefixes aid identification, not authentication or guaranteed uniqueness; the record retains full hashes. Keep existing schemas, content, MIME types and JSON checkpoint behavior unchanged. Filenames do not include reviewer names or notes.

Verify Unicode and adversarial names, bounded UTF-8 filename length, hash ordering/fallback, matching JSON/HTML stems, and actual browser-suggested names. Mutation-test sanitization and packet ordering. Run repository checks before publication.
