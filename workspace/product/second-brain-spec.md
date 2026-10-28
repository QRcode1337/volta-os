# Second Brain Spec

Route `/second-brain`. Views: 3D orb · 2D map · Timeline · Routines · Skills · Applications.

| View | Data |
|---|---|
| 3D orb / 2D map | Obsidian vault wikilink graph (`/api/brain/graph`), notes via `/api/brain/note` |
| Timeline | LTM screen-capture activity (`/api/ltm/days`) |
| Routines | Real OpenClaw cron + launchd (`/api/routines`) |
| Skills | Real skills + transcript usage (`/api/skills-real`) |
| Applications | Memory sources (`/api/sources`) + MCP servers (`/api/mcp`) |

`GET /api/workspace` scans `./workspace`: one node per real file (department = folder: business, content, research, agents,
product, personal; root/context files under memory), skills from `skills/*/SKILL.md` frontmatter, artifacts from `artifacts/<tag>/`.
No procedural or seeded counts. `GET/PUT /api/files` for quick edit.
