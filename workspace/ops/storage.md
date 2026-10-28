# Storage and secrets policy

> Updated 2026-10-28. Read before any write larger than a text file. Sources: `~/.claude/CLAUDE.md` (disk rules),
> `~/Documents/PROJECTS/CLAUDE.md`, `~/ErisMorn/MEMORY.md` (environment gotchas), VOLTA `docs/HANDOFF.md`.

## Volumes
| Volume | Use | Notes |
|---|---|---|
| Internal SSD (`/`) | OS, apps, repos | Near full (14 GiB free on 2026-10-28). Check `df -h /` before installs. |
| `/Volumes/Windsor` | VOLTA bulk: `VOLTA/{research,podcast,music,jev,services,...}` | exFAT, no permissions model. Default target for renders, audio, indexes. |
| `/Volumes/Voltamachina` | Research corpus, cache offload | Not `/Volumes/FLIP`. Systems flagged it near full (97%) on 2026-10-27. |
| `~/Documents/PROJECTS/ErisMornCloud/<project>/` | Offload for logs, archives, datasets | iCloud-synced; large files may be evicted. |
| `~/Documents` (iCloud) | Mostly dataless placeholders | Detect `stat.blocks === 0 && size > 0`; never read; offer `brctl download "<path>"`. |

## Rules
- Flag any operation expected to write > 500 MB and ask first.
- Watch silent caches: `node_modules`, `.venv`, `~/Library/Caches`, `~/.cache`, `dist/`, `build/`, `.next/`, HuggingFace, Docker.
- On disk-full, check `~/Library/Caches/CloudKit` first (regrows 8+ GiB overnight); pause iCloud to stop it.
- Cleanup: `~/bin/disk-cleanup.sh` (dry run by default, `--apply` to act). Weekly cache-cleanup daemon Sat 10:00.
- Never put working state that must not be evicted (Editor NLE files, Studio project files, research graphs) in iCloud folders.

## Secrets
- Keys live in `~/Volta-OS/.env.local` (git-ignored, server-side only) and the OpenClaw secret store. Never in workspace files.
- Never print secrets, pass them in argv, or log them. Mask with VOLTA `redact.ts`.
- Open items: plaintext secrets flagged by `openclaw secrets audit`; key rotation list in HANDOFF (see `context/priorities.md`).
