#!/bin/bash
# SessionStart hook: install project dependencies so tests, linters, and the
# dev server work in Claude Code on the web. Synchronous so deps are ready
# before the session begins.
set -euo pipefail

# Only run in remote (Claude Code on the web) environments. Local sessions
# already have their own node_modules managed by the developer.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# pnpm is the project's package manager (pnpm-lock.yaml). Enable it via corepack
# so it's available regardless of the base image, then install.
# `pnpm install` (not `--frozen-lockfile`/`ci`) so the cached container state is
# reused and the step is idempotent across repeated runs.
corepack enable pnpm 2>/dev/null || true
pnpm install
