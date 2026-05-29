#!/usr/bin/env bash
# SessionStart hook: inject the using-superpowers skill so the agent knows
# how to find and use the vendored Superpowers skills from the first reply.
# Self-contained repo-local port of obra/superpowers' plugin session-start hook.

set -euo pipefail

# CLAUDE_PROJECT_DIR is set by Claude Code; fall back to this script's repo root.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SKILL_FILE="${PROJECT_DIR}/.claude/skills/using-superpowers/SKILL.md"

content=$(cat "$SKILL_FILE" 2>/dev/null || echo "Error reading using-superpowers skill")

# Escape for JSON embedding: single-pass parameter substitutions.
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

escaped=$(escape_for_json "$content")
context="<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n**Below is the full content of your 'using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${escaped}\n</EXTREMELY_IMPORTANT>"

# printf (not heredoc) to avoid the bash 5.3+ heredoc hang.
printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$context"

exit 0
