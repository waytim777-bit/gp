# Governance Instructions

Canonical source: `AGENTS.md`.

AI collaboration assets must keep `AGENTS.md` as the single source of truth. `CLAUDE.md` must be a symlink to `AGENTS.md`; `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, and `.claude/skills/` are mirrors or workflow supplements.

After changing AI collaboration assets, run:

```bash
python scripts/check_ai_assets.py
```
