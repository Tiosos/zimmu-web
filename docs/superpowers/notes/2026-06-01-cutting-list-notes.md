# Cutting List Export — Implementation Notes

## Decisions

- `buildCsv` lives in `CuttingList.tsx` (not `utils.ts`) — only used by this component
- CSV uses `\n` line endings — acceptable for modern editors and Google Sheets
- Only labels containing commas are quoted; labels cannot contain newlines via the sidebar input
- Numbers are emitted as-is (no rounding) — user-entered values are already clean
