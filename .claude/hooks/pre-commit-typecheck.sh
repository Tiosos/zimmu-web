#!/bin/bash
# PreToolUse hook: block git commit if TypeScript errors exist.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

if ! pnpm typecheck 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"TypeScript errors found — fix them before committing."}}\n'
  exit 2
fi
