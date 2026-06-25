---
name: analyze-issue
description: Analyze a GitHub issue for this repository and save the review artifact under `.claude/reviews/`.
---

# Analyze Issue

Follow `AGENTS.md` as the canonical rule source.

Default workflow:

1. Read the issue, linked context, relevant code, tests, scripts, workflows, and docs.
2. Identify the affected area: backend, API, Web, Desktop, workflow, docs, or AI collaboration assets.
3. Prefer CI and workflow evidence before adding local validation recommendations.
4. Save analysis artifacts under `.claude/reviews/`.
5. Do not run `git pull`, `git push`, `git tag`, or create PRs without explicit user confirmation.
