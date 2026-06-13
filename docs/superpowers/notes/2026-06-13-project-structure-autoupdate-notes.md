# project-structure.html auto-update on release — notes

- **2026-06-13** — Added a release-triggered updater for `project-structure.html`.

## Why a GitHub Actions workflow, not a "hook"

The request was for a "hook" that fires on a new release. Neither a Claude Code
hook (`.claude/settings.json`) nor a git hook can observe a GitHub *release* —
both run locally and only see local tool/git events. A release is a remote
GitHub event, so the only mechanism that fits is a GitHub Actions workflow with
`on: release: [published]`. That's `.github/workflows/update-project-structure.yml`.

## Marker-based regeneration

The HTML is mostly hand-written architecture documentation that can't be derived
mechanically. Only the structural, drift-prone parts are auto-managed, fenced by
`<!-- AUTOGEN:NAME --> … <!-- /AUTOGEN:NAME -->` comments and rewritten by
`scripts/update-structure-html.mjs`:

- `src-tree`, `docs-tree` — full file trees walked from disk.
- `test-file-count` — count of `*.test.ts(x)` under `src/`.
- `version`, `date` — release tag + date.

The generator does a global replace per region name, so `version`/`date` can
appear in more than one spot (badge + footer) and all stay in sync.

## Decisions

- **Stamping gated on `RELEASE_TAG`.** Local runs (`node scripts/update-structure-html.mjs`)
  regenerate trees + count only and leave version/date alone, so running the
  script during normal dev never spuriously rewrites the release stamp. Only the
  workflow (which sets `RELEASE_TAG`) stamps.
- **Test *file* count, not pass count.** Countable from a glob with no test run.
  The "374 passing / 6 skipped" figure was dropped from the auto region because
  it can't be known without running vitest, which is out of scope for this fast,
  deterministic updater.
- **No deps / no pnpm install in CI.** The script uses only Node built-ins
  (`node:fs`, `node:path`), so the workflow just needs `setup-node` + `node`.
- **`scripts/` is outside the TS project.** `tsconfig.app.json` includes only
  `src`, `tsconfig.node.json` only `vite.config.ts`, so the `.mjs` generator is
  not typechecked and won't affect the pre-commit `tsc -b` hook.
- **Commit target: main with `[skip ci]`.** Keeps `main` always reflecting the
  latest release; `[skip ci]` prevents any push-triggered workflow loop (the
  release event itself wouldn't re-fire from a push anyway).
