# /robo UI Library

> Live components: `~/Volta-OS/src/components/robo-ui/` (exported from `index.ts`); showcase in the Elements app (`/apps/elements`).
> Brand rules: `skills/robo/SKILL.md`. This table is a quick reference; the source files win if they differ.

| Component        | Props (stable)                                     | Notes                              |
|------------------|----------------------------------------------------|------------------------------------|
| HudPanel         | title, icon?, actions?, headerExtra?, className?, bodyClassName? | Standard container   |
| ModelEffortBadge | model, effort?, label?, size?                      | Tier color pill                    |
| PixelMascotLogo  | size?, color?                                      | 8×8 crisp mascot                   |
| Toggle           | checked, onChange, label?, size?                   | Switch                             |
| Modal            | open, onClose, title?, children                    | Esc + backdrop close, focus return |
| ToastProvider    | useToast().push({ title, tone })                   | Bottom-right stack                 |
