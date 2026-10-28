# Applications — connector index

> Updated 2026-10-28. Sources: VOLTA `GET /api/mcp` (22 servers), `docs/HANDOFF.md`, Studio/Generations/Music config.
> Policy: CLI → API → MCP, lightest first. Env var **names** at most; values live in `~/Volta-OS/.env.local` or the OpenClaw secret store.
> Per-connector files keep the template frontmatter (`id`, `tier`, `enabled`, `context_tokens`) so they render as Applications nodes.

## CLI (0 preloaded tokens)
| id | Tool | Used for |
|---|---|---|
| cli-ffmpeg | ffmpeg | Studio "ffmpeg Tools", proxies, concat (keep the existing file) |
| cli-gh | gh | Launchpad repos (`QRcode1337/*`), PRs |
| cli-claude | `claude -p` | VOLTA skill runs, podcast research, Fix with agent (Max plan) |
| cli-openclaw | `openclaw` (`~/bin`) | cron list/health, secrets audit, wiki |
| cli-hyperframes | hyperframes CLI | HTML video compositions, renders |
| cli-remotion | Remotion | Studio Remotion presets |
| cli-tailscale | tailscale | `serve` for phone access (VOLTA `:8447`) |

## API (server-side keys)
| id | Service | Used for |
|---|---|---|
| api-omniroute | OmniRoute gateway | All LLM text (combos in `config/llm-routes.json`) |
| api-lmstudio | LM Studio `:1234` | Local qwen 9B, nomic embeddings, Honcho deriver |
| api-media | xAI image/video, ElevenLabs TTS, Gemini TTS, Runway, Replicate | Generations, podcast voices (quote first) |
| api-notion | Notion API | Scripts, Carousels, Recos, Dreams, Launchpad pins |
| api-suno | local suno-api `:3010` | VANTA VECTOR generation (pending cookie) |
| api-youtube | YouTube / vidIQ | Soon: The Strangest Times analytics once uploads start (`api-youtube.md`) |
| ifttt | IFTTT (cloud) | Social cross-posting: X → Discord/Sheets/Docs/Evernote, QUANTUM_VAULT → Facebook (`ifttt.md`). Not an MCP in Claude Code. |

## MCP (preload context every session — audit usage)
User: blender, chrome-devtools, hexstrike-ai, heygen (needs auth), MCP_DOCKER, pieces-vault-memory, rea, stitch, unvolta_ltm.
Project: aperture, cmem, exa, jev. Plugin: mcp-search (claude-mem), notion, playwright, supermemory.
**Failing on 2026-10-28** (delete per Patrick's rule, or fix if still wanted): agent-cards (401), auggie (binary missing),
funes (not on PATH), jetbrains (refused), my-pieces-memory (refused; Pieces OS was shut down 2026-10-15).

Claude-session connectors (not in Claude Code config): IFTTT, Gmail, Google Calendar, Notion, vidIQ, Vercel, Netlify and others —
usable from Claude sessions, not from VOLTA's `claude -p` runs.

## Per-connector files
`cli-ffmpeg.md` · `cli-gh.md` · `api-media.md` · `api-youtube.md` · `ifttt.md` · `mcp-gmail.md` · `mcp-gcal.md` (drafts only; TODO Patrick: in scope?).
Removed 2026-10-28 (template, no evidence of use): cli-aws, cli-premiere, api-mfp, mcp-slack, mcp-excalidraw.
