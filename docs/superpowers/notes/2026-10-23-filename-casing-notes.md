# Filename casing notes

- Defect found 2026-10-23 on Windows: `src/ui/ProductionReleaseGate.tsx` (component) and
  `src/ui/productionReleaseGate.ts` (assessment logic) were one letter apart, and so were their
  tests. TypeScript and Vite resolve `./ProductionReleaseGate` by probing `ProductionReleaseGate.ts`
  first; on a case-insensitive filesystem that probe matches `productionReleaseGate.ts`, so the
  import loaded the logic module and found no component. Result: eight `tsc` errors across
  `App.tsx`, `ProductionPacketVerifier.tsx` and two tests, and all four `ProductionReleaseGate.test.tsx`
  cases failing with `Element type is invalid ... got: undefined`. The app could not be typechecked or
  committed on Windows (the pre-commit hook runs typecheck), yet CI stayed green because it runs on
  Linux, where the two files are genuinely distinct. Introduced by `2d20af5a` (2026-10-09) and
  unnoticed because the feature batches were written in a Linux worktree.

- Fixed by renaming the *logic* module, not the component: `productionReleaseGate.ts` →
  `productionReleaseAssessment.ts` (and its test). The component keeps its name, and the new name
  matches the record it produces (`kind: 'production-release-assessment'`). Eight import sites
  updated across `src/scene/releases.ts`, `src/scene/__fixtures__/release.ts`,
  `src/ui/buildProductionPacket.ts` (+ test), `src/ui/ProductionReleaseGate.tsx` (+ two tests) and
  the renamed test. No exported symbol, record shape or behaviour changed.

- Added `scripts/check-filename-casing.mjs` (`pnpm check:file-casing`, wired into `ci.yml` after
  `lint`) so the class of defect cannot return. The rule is deliberately about the *extensionless*
  stem: two tracked files in one directory, both of a module extension, whose names are equal once
  the extension is removed and case is ignored. That is exactly what module resolution confuses —
  `Foo.ts`/`foo.tsx` collide, and so do `Foo.test.ts`/`foo.test.tsx`, which is why the check also
  covers tests. Non-module extensions are skipped: `Button.css` beside `Button.tsx` is imported by
  its full name and cannot be confused with the component. It reads `git ls-files`, so it sees what
  a checkout will contain rather than stray local files, and it costs about 40 ms. Checked both
  ways: a temporary `TempCase.ts`/`tempCase.tsx` pair fails the check with both paths named, and
  removing them passes.

- The guard's first catch was pre-existing and benign: `useDebouncedCallback.test.ts` and
  `useDebouncedCallback.test.tsx` (both real, neither imported by anything). The direct hook tests
  became `useDebouncedCallback.hook.test.ts`, leaving the rendered/unmount cases under the plain
  name. No test content changed.

- Verification on Windows: `pnpm typecheck` exits 0 (was 8 errors); `pnpm lint` clean;
  `pnpm check:file-casing` reports no collisions across 1107 tracked files; the seven packet/release/
  debounce test files pass 80/80; `pnpm build` completes. The first full run under the default 5 s
  timeout reported 2 failures in heavy component tests that pass in isolation, so the suite was
  re-run with the invocation the repository already uses for this host (`--maxWorkers=4
  --testTimeout=15000`, excluding the listener-bound catalogue HTTP spec): **247 files, 4430 passed,
  10 skipped**, 159 s.

- `project-structure.html` was regenerated with `node scripts/update-structure-html.mjs`; only the
  three renamed paths moved.

- Left alone: the historical plan `docs/superpowers/plans/2026-10-14-persisted-release-record.md`
  still names the old path, because it records what was true when that work was planned.
