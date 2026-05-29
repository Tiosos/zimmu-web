# Superpowers skills

Project-level [Superpowers](https://github.com/obra/superpowers) skills by
Jesse Vincent (MIT licensed), vendored into `.claude/skills/` so they are
available to anyone running Claude Code in this repository.

- **Source:** https://github.com/obra/superpowers
- **Version:** 5.1.0
- **Installed:** 2026-05-28

These are a software-development methodology made of composable skills (TDD,
systematic debugging, brainstorming, planning, code review, etc.). Claude
auto-invokes them when a task matches a skill's `description`.

## Updating

Re-copy the `skills/` directory from the upstream repo:

```bash
git clone --depth 1 https://github.com/obra/superpowers.git /tmp/superpowers
cp -r /tmp/superpowers/skills/* .claude/skills/
```

> Note: upstream also ships a SessionStart hook (in its `hooks/` dir) that
> auto-loads the `using-superpowers` skill at the start of every session. That
> hook is part of the plugin distribution and is not vendored here. To get the
> full auto-bootstrapping behavior, install the official plugin instead:
> `/plugin install superpowers@claude-plugins-official`.
