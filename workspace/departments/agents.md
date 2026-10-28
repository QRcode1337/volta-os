# Agent Fleet — Department Router

> Agent fleet department (added 2026-10-28; VOLTA's department list includes `agents`).
> Owns the agents, gateways, memory stack, every scheduled routine and the IFTTT cross-posting automations.

## Services (VOLTA Systems and Launchpad probe these)
| Service | Where | Notes |
|---|---|---|
| OpenClaw gateway | `:18789`, launchd `ai.openclaw.gateway` | Agent `main` (ErisMorn). Leave it alone even when it looks idle. |
| Hermes gateway | launchd `ai.hermes.gateway` | Status error on 2026-10-28; no cron jobs. TODO: keep, fix or retire? |
| OmniRoute | launchd `com.omniroute.autostart`, hourly breaker decay, 04:15 restart | Autostart status error on 2026-10-28. High CPU = heap GC thrash; kill orphan child first. |
| Honcho | API `:8000` (Docker), LM Studio `:1234` | Intended live memory layer. |
| LTM (unvolta) | launchd daemon, ingest every 30 m, prune 04:30 | Screen memory; VOLTA LTM app. |
| claude-mem | worker `:37777` | Dies on missing node_modules; restart via nohup. |
| Suno API | `:3010`, launchd `com.epsilon.suno-api` | Waiting on Patrick's cookie. |
| VOLTA OS | `:50000`, launchd `com.epsilon.volta-os` | `launchctl kickstart -k gui/$(id -u)/com.epsilon.volta-os` |

## Files here
- `routines/README.md` — every real routine, schedule, owner, last status, where its output lands.
- `ops/storage.md` — volumes, offload rules, iCloud placeholders, CloudKit leak.
- `ops/runbooks.md` — not written yet (TODO): restart/repair steps per service (seed from ErisMorn MEMORY "Environment gotchas").
- `applications/ifttt.md` — IFTTT applets, failures, suggested fixes.
- `applications/README.md` — connectors and MCP servers.

## Skills
`openclaw-health` (read-only cron diagnosis) · `heartbeat` · `superpowers:systematic-debugging` · `claude-mem:mem-search`.

## Rules
- Diagnose read-only first; propose fixes for Patrick's approval. Cron Run-now/Pause from VOLTA needs his OK.
- Never print, log or pass secrets in argv. Use the OpenClaw secret store (SecretRef) for new credentials.
- Failing MCP entries: delete, don't debug.
- Fixes should be one click: a command to run or a message to an agent.
