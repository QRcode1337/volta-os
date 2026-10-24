# /robo UI Library

| Component        | Props (stable)                                     | Notes                              |
|------------------|----------------------------------------------------|------------------------------------|
| HudPanel         | title, icon?, actions?, headerExtra?, className?, bodyClassName? | Standard container   |
| HudPill          | label, onClick?, href?, primary?                   | Action pill                        |
| ModelEffortBadge | model, effort?, label?, size?                      | Tier color pill                    |
| PixelMascotLogo  | size?, color?                                      | 8×8 crisp mascot                   |
| Toggle           | checked, onChange, label?, size?                   | Switch                             |
| Modal            | open, onClose, title?, children                    | Esc + backdrop close, focus return |
| ToastProvider    | useToast().push({ title, tone })                   | Bottom-right stack                 |
