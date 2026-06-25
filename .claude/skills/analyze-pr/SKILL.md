---
name: analyze-pr
description: Review a GitHub pull request for this repository and save the review artifact under `.claude/reviews/`.
---

# Analyze PR

Follow `AGENTS.md` as the canonical rule source.

Default review order:

1. 必要性
2. 关联性
3. 描述完整性
4. 验证证据
5. 实现正确性
6. 合入判定

Prioritize correctness, security, blocking CI, PR description mismatches, missing rollback plans, and test gaps. Save review artifacts under `.claude/reviews/`.
