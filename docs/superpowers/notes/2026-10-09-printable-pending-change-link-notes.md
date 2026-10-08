# Printable pending detected-change shortcut — notes

- Extends the existing count renderer to resolve change references with the already shared finding-ID map. Imported reviews normalize acknowledgment order to comparison order.
- No new article navigation is necessary: detected findings already return to their part summary.
- Validation: typecheck, lint, 172 unit files / 2,956 tests passed with 10 existing skips; catalogue/application builds and Chromium packet-comparison flow passed.
- Both deliberate regressions (first recorded instead of first pending; wrong reference-to-target map) produced assertion failures. Restored source byte-for-byte from `/tmp/pending-change-link-html.bak`.
