# Clear revision navigation filters

Add an always-visible Clear navigation filters button beside the search controls. Reset search (including whitespace), classification and pending-only together. Disable the button when all controls already have default values. Keep the active visible finding selected if possible; when no finding is visible, use the first complete-list finding. Never change notes, acknowledgments, edited status, saved schema, download scope or pending resume generation.

This change builds on PR #96's classification navigation; publish against its feature branch until it is merged. Avoid inventing a second classification implementation or changing shared report logic. Do not add shortcuts or auto-clear on imports.

Verify all three individual filters and combined empty results, retained selection and review progress, unchanged edited notifications and late resume completion. Add a real-browser clear from a zero-match view. Deliberately break each reset, disable predicate and selection preservation, inspect assertion failures, restore backups. Run the required full unit suite, typecheck, lint, builds and browser test, then monitor exact-head CI.
