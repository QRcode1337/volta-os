---
name: search-connectors
description: Pick the lightest connector (CLI → API → MCP) for a task.
model: haiku
effort: medium
category: artifact
---

# /search-connectors

Pick the lightest connector (CLI → API → MCP) for a task. Reads `applications/*.md` and returns one
recommendation with the context cost it avoids.

## When to use
- Explicitly by command, or by any skill before it reaches for an MCP.
- Routed through Jev; default tier **HAIKU** at **MEDIUM** effort.

## Decision order
1. **CLI** if a local binary covers it (0 preloaded tokens): ffmpeg, gh, aws, premiere-cli.
2. **API** if a documented endpoint covers it (≈ 1k tokens of docs on demand).
3. **MCP** only if the task needs interactive tools across many calls, and the MCP is enabled.
Report: chosen connector · tier · tokens avoided vs the heaviest option · fallback.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
