# Printable revision review navigation

Add a compact, accessible contents list to standalone revision review HTML. Link to review progress, overall notes, detected changes, other changed outputs and comparison limitations; include packet metadata only when present. Use fixed section IDs and fragment-only links. Add return-to-contents links after the three potentially long review groups.

Navigation must work offline with scripts disabled. Preserve all report content, independent counts, pending-first ordering, escaping and scope statements. Keep navigation out of print/PDF output using print CSS. Never derive link destinations from packet paths or user text.

Verify every link resolves to exactly one target, conditional metadata and empty groups, adversarial content and reports beyond the UI preview. Exercise real saved HTML navigation and printing in the browser workflow, then run the repository checks.
