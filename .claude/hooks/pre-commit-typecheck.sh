#!/bin/bash
# PreToolUse hook: block `git commit` if TypeScript errors exist.
#
# The `if` matcher tests the whole Bash command string, so it also fires on compound commands and
# on heredoc bodies that merely CONTAIN the words "git commit" — which ran typecheck (and hard-failed
# unrelated commands) during wide refactors that are legitimately red mid-flight. Re-check here,
# where the real command text is available, and exit quietly when it is not an actual commit.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

command=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);process.stdout.write(i.tool_input?.command||'')}catch(e){}})" 2>/dev/null || true)

# Only guard when a segment of the command actually invokes `git commit`. Segments are split on
# the shell operators that start a new command; a heredoc body has none of them at segment start.
if [ -n "$command" ]; then
  if ! printf '%s' "$command" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+([-a-zA-Z0-9=_/.]+[[:space:]]+)*commit\b'; then
    exit 0
  fi
fi

if ! pnpm typecheck 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"TypeScript errors found — fix them before committing."}}\n'
  exit 2
fi
