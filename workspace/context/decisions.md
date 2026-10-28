# Decisions — permanent

> Append-only log; newest last. One decision per bullet: date · decision · source.
> Sources: `~/ErisMorn/MEMORY.md` (Architecture Decisions, Lessons), `~/.openclaw/wiki/main/{actions.md,sources/DECISIONS.md}`, VOLTA `docs/HANDOFF.md`.

- 2026-05-29 · CASCADE (SMB AI receptionist) is done and no longer tracked; archive only. · ErisMorn MEMORY
- 2026-09 · Default models are OmniRoute combos (`agem`, fallbacks SmartSpread, codex-first); the older Opus/GPT/Qwen line is superseded. · ErisMorn MEMORY
- 2026-09 · Claude Max via OAuth; never direct-API billing; extra-usage overflow stays OFF. · ErisMorn MEMORY
- 2026-09 · Local-first embeddings (Ollama `nomic-embed-text`); no workspace SQLite index is a runtime dependency. · ErisMorn MEMORY
- 2026-10-04 · Honcho is the intended live memory layer for OpenClaw (`openclaw-honcho`). · actions.md
- 2026-10-15 · Pieces OS shut down; history lives in `~/Pieces-Vault`, recalled via `pieces_vault__recall`. · ErisMorn MEMORY
- 2026-10-25 · VOLTA lives at `~/Volta-OS` (out of iCloud). Writes only to `./workspace`, `config/`, `/Volumes/Windsor/VOLTA/**`. · HANDOFF
- 2026-10-25 · LLM text routes through OmniRoute or local LM Studio; paid media needs a quote and confirm step. · HANDOFF
- Standing · Satellite devices (Watch, Telegram, CLI) never query RAG directly; they receive pushed updates. · ErisMorn MEMORY
- Standing · Never advance pipeline state on backend failure (Voltamachine Stage A rule). · ErisMorn MEMORY
- Standing · Use `/Volumes/Voltamachina` for cache offload, not `/Volumes/FLIP`. · ErisMorn MEMORY
- Standing · Failing MCP entries are deleted, not debugged. · MY-RULES
- 2026-10-28 · Timezone is America/New_York. · Patrick
- 2026-10-28 · Top business priority: first paying clients for EPSILON LLC (AI optimization + digital marketing). · Patrick
- 2026-10-28 · The Strangest Times YouTube goal: ad revenue and sponsors. · Patrick
- 2026-10-28 · ARGUS (argusweb.bond) is active. · Patrick
- 2026-10-28 · Workspace template content (Jay E / RoboNuggets) replaced with Patrick's; Community department removed; Research and Agent fleet added. · Patrick (approved swap)
