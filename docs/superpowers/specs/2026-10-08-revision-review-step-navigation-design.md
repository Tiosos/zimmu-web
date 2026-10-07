# Step through matching revision changes

Add Previous change and Next change buttons alongside a position indicator below the change selector. Navigate in comparison order through changes eligible under both search and pending-only filters. Disable Previous at the first match and Next at the last; a single match disables both. Hide navigation when no change is eligible.

Use the existing resolved active selection, including its fallback after filtering or acknowledgment. Navigation only changes selection, retaining per-change notes, acknowledgments and complete exports. It does not acknowledge work, change the record schema or cancel pending imports.

Verify boundaries, selector interoperability, sparse search matches, pending-filter composition, selection fallback, restored notes and complete exports. Exercise single-match/empty states in the real-packet browser test, mutation-test the navigation direction, and run repository checks before publishing.
