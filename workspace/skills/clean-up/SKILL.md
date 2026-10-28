---
name: clean-up
description: Find orphaned dev processes, temp files and stale caches; report before removing.
model: haiku
effort: low
category: self-triggered
---

# /clean-up

Find orphaned dev processes, temp files and stale caches; report before removing. Self-triggers when the
dev box shows memory pressure (> 85% RAM), when a port the OS needs (50000) is already bound, or when free
disk drops under 10 GB. Policy: `ops/storage.md`. Existing tool: `~/bin/disk-cleanup.sh` (dry run by default, `--apply` to act) — use it first.

## When to use
- Triggered by the agent when the task pattern matches (EADDRINUSE, ENOSPC, sluggish builds, fan noise complaints).
- Tier routed by JEV (see `product/jev-router.md`); default **HAIKU** at **LOW** effort — this is pattern matching, not reasoning.

## Steps (macOS / Linux)
1. **Inventory, read-only.**
   - Processes: `ps -axo pid,ppid,rss,etime,command` → flag `node`, `next-server`, `esbuild`, `vite`, `turbopack`,
     `python -m http.server` whose parent PID is 1 (orphaned) and whose elapsed time is > 2h.
   - Ports: `lsof -nP -iTCP -sTCP:LISTEN` → map listeners to the flagged PIDs.
   - Temp: files older than 3 days under `$TMPDIR` and `/tmp` owned by the current user.
   - Caches: `.next/cache`, `node_modules/.cache`, `~/.npm/_cacache` (report size only), Xcode DerivedData, `~/Library/Caches/CloudKit` (check first on disk-full; regrows overnight).
2. **Report** a table: item · size/RSS · age · why it's safe · proposed action.
3. **Ask** before acting on anything outside `$TMPDIR` or a project-local cache.
4. **Act** with `kill -TERM` (never `-9` first, wait 5s), and move files to Trash rather than `rm` when possible.
5. **Verify**: re-run the inventory and report the delta (RAM freed, ports released, files cleared, disk recovered).

## Never
- Never kill processes not owned by the current user, or anything named `claude`, `hermes`, `openclaw`, `omniroute`, `tailscaled`, `ollama`, `LM Studio`, `honcho`.
- Never touch `~/Library/Mobile Documents`, Photos libraries, `.git`, or anything under `workspace/`.
- Never empty the Trash.

## Report format
```
freed   2.4 GB RAM      killed 4 orphaned node processes
cleared 182 temp files  released ports 3000, 5173
disk    +3.1 GB         skipped 2 items (needs approval)
```

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Recos. Newest last. Entries dated before 2026-10-28 are template-era defaults. -->
- 2026-10-11 · Leave the Hermes gateway (port 18789) alone even if it looks idle.
