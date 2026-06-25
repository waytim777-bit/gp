---
name: fix-issue
description: Fix a GitHub issue in this repository while following the repository validation and delivery workflow.
---

# Fix Issue

Follow `AGENTS.md` as the canonical rule source.

Default workflow:

1. Read the issue, current implementation, tests, scripts, workflows, and docs before editing.
2. Keep the change scoped to the issue and existing project boundaries.
3. Explain the original problem, root cause, fix point, verification, remaining risk, and rollback path.
4. Save any analysis artifacts under `.claude/reviews/` when useful.
5. Do not run `git pull`, `git push`, `git tag`, or create PRs without explicit user confirmation.
