# Construction presets notes

2026-10-21: Main 60c4e41 already has coordinated construction controls. This batch adds personal reuse through that existing draft/preview rather than changing construction generation or company-rule authority. No response to the optional direction question arrived before implementation; proceeding with the recommended construction batch.

The existing editor already supplies drawer-fit, half-overlay/frame, material and board-override validation and discrete history. Integration adds only an import/render; library staging clears prior construction preview. Library payloads deliberately omit all three size fields and frame opening layouts.

Async imports use a current-library ref to avoid overwriting edits made while reading a file, plus a generation invalidated by edits, reload, newer reads, external events and unmount. Writes compare the captured raw string even if a storage event was missed.

Focused baseline: 69 tests across pure library, new UI and existing construction editor. Mutation review identified a genuine limit-test gap (101 invalid objects could fail for unrelated validation) and two diagnostic assertions that failed via missing DOM queries instead of assertions. Added 101 valid entries and moved state assertions before diagnostic queries. happy-dom localStorage methods require direct-instance spies and explicit mockRestore; prototype spies do not intercept its proxy, and restoreAllMocks alone did not release a cached method.

The user subsequently confirmed the recommended construction presets/joinery direction. Lint required synchronizing the current-library ref in an effect rather than during render; the import generation lives in a stable ref object captured by cleanup. Rechecked storage-conflict and delayed-import mutations after that change.

Validation completed: typecheck and lint pass; full suite 216 files, 3,859 passing tests and 10 skipped (268.6 seconds); CAD and catalogue production builds pass (existing bundle-size warning). All six isolated Chromium flows pass: new presets/reload/size retention/apply/undo, export/import/selective reuse, both existing construction transitions and both personal layout library regressions. Twenty-one guard mutations were killed with assertion evidence; backed-up sources restored exactly. No application source was edited during the complete unit or browser runs. Temporary port-5196 Playwright config removed after checks.
