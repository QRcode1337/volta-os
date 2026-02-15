# Volta OS - Cyberpunk Brutalism Design System

## 🎨 Visual Identity

### Style: Cyberpunk Brutalism
- Sharp geometric shapes
- High contrast neon on dark
- Glitch aesthetics
- Holographic accents
- RGB split effects
- Scanline overlays

### Color Palette

**Primary Neon Colors:**
```css
--neon-pink: #FF00FF      /* Magenta - Primary accent */
--hot-pink: #FF006E       /* Hot Pink - Secondary accent */
--electric-cyan: #00FFFF  /* Cyan - Tertiary accent */
--matrix-green: #00FF00   /* Green - Success states */
--alert-red: #FF0000      /* Red - Warnings/errors */
```

**Background Layers:**
```css
--bg-void: #0D0D0D        /* Pure dark - Main background */
--bg-layer-1: #1A1A2E     /* Slightly lifted - Cards */
--bg-layer-2: #252b3b     /* More lifted - Nested elements */
```

**Text Hierarchy:**
```css
--text-primary: #E2E8F0   /* Main text */
--text-secondary: #94A3B8 /* Muted text */
--text-neon: #00FFFF      /* Highlighted text */
```

## 📐 Design Principles

1. **Geometric Brutalism**
   - Sharp edges, no rounded corners (except intentional circles)
   - Angular shapes at 45° and 90°
   - Clip-path geometric cuts

2. **Neon Contrast**
   - High contrast between dark backgrounds and neon accents
   - Glow effects on interactive elements
   - Pulsing animations for status indicators

3. **Layered Depth**
   - Subtle shadows and borders
   - No gradients for backgrounds
   - Holographic corner accents

4. **Glitch Aesthetic**
   - RGB split on hover
   - Scanline effects
   - Digital distortion

## 🔤 Typography

**Fonts:**
- **Headings:** Fira Code (monospace for terminal aesthetic)
- **Body:** Fira Sans (clean sans-serif)
- **Data/Numbers:** Fira Code (monospace for alignment)

**Scale:**
- Display: 56px (3.5rem)
- H1: 40px (2.5rem)
- H2: 30px (1.875rem)
- H3: 24px (1.5rem)
- Body: 14px (0.875rem)
- Small: 12px (0.75rem)
- Micro: 10px (0.625rem)

## ✨ Effects & Animations

### Glow Effects

```css
/* Text glow */
text-shadow: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan);

/* Border glow */
box-shadow: 0 0 10px var(--neon-pink), 0 0 20px var(--neon-pink);

/* Pulsing glow (for status indicators) */
@keyframes neon-pulse {
  0%, 100% { text-shadow: 0 0 10px currentColor, 0 0 20px currentColor; }
  50% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor, 0 0 60px currentColor; }
}
```

### Glitch Effects

```css
/* RGB Split on hover */
@keyframes rgb-split {
  0%, 100% {
    text-shadow: -2px 0 0 #FF00FF, 2px 0 0 #00FFFF;
  }
  50% {
    text-shadow: 2px 0 0 #FF00FF, -2px 0 0 #00FFFF;
  }
}

/* Position glitch */
@keyframes glitch {
  0% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(-2px, -2px); }
  60% { transform: translate(2px, 2px); }
  80% { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}
```

### Geometric Clip Paths

```css
/* Angled left corner cut */
.clip-angle-left {
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%);
}

/* Angled right corner cut */
.clip-angle-right {
  clip-path: polygon(0 0, 90% 0, 100% 100%, 10% 100%);
}

/* Corner notch */
.clip-corner {
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%);
}
```

### Holographic Effects

```css
.holographic {
  background: linear-gradient(
    45deg,
    transparent 25%,
    rgba(255, 0, 255, 0.1) 50%,
    transparent 75%
  );
  background-size: 200% 200%;
  animation: gradient-shift 3s ease infinite;
}
```

## 🎯 Component Patterns

### Cards
- Dark background (#1A1A2E)
- Neon border (cyan/pink/green based on context)
- Holographic corner accent
- Scanline overlay
- Hover glow effect

### Buttons
- Geometric clip-path shape
- Neon background color
- Box-shadow glow
- Scale on hover (1.05)
- RGB split effect on active

### Status Indicators
- Pulsing dot animation
- Neon border
- Monospace font for text
- Uppercase labels

### Charts
- Dark transparent backgrounds
- Neon gradient fills
- Glowing line strokes
- Grid with pink/cyan accents

## 📱 Responsive Breakpoints

```css
/* Mobile */
@media (min-width: 375px) { }

/* Tablet */
@media (min-width: 768px) { }

/* Desktop */
@media (min-width: 1024px) { }

/* Large Desktop */
@media (min-width: 1440px) { }
```

## ♿ Accessibility

- Minimum contrast ratio: 4.5:1 for text
- All interactive elements have visible focus states
- Respect `prefers-reduced-motion` for animations
- Keyboard navigation support
- Screen reader friendly labels

## 🚀 Performance

- Use GPU-accelerated properties (transform, opacity)
- Avoid layout shifts
- Lazy load images and heavy components
- Minimize animation duration (150-300ms for micro-interactions)
- Use `will-change` sparingly

## 📦 Component Library

### Core Components
- `CyberCard` - Card with neon borders
- `CyberButton` - Button with glitch effects
- `StatusBadge` - Badge with pulsing indicator
- `CyberInput` - Input field with cyberpunk styling

### Data Visualization
- `RealtimeChart` - Streaming area chart
- `AgentStatusGrid` - Grid of agent status cards
- `MetricsDashboard` - Performance metrics panel

### Loading States
- `SkeletonCard` - Skeleton with neon pulse
- `CyberSpinner` - Spinner with holographic effect
- `CyberProgress` - Progress bar with gradient animation

## 🎨 Example Usage

### Cyberpunk Card

```tsx
<CyberCard className="p-6">
  <h3 className="text-lg font-['Fira_Code'] text-[#00FFFF] mb-2">
    System Status
  </h3>
  <p className="text-sm text-[#94A3B8]">
    All agents online and operational
  </p>
</CyberCard>
```

### Neon Button

```tsx
<CyberButton
  variant="primary"
  onClick={handleAction}
  className="shadow-[0_0_20px_rgba(255,0,255,0.6)]"
>
  EXECUTE
</CyberButton>
```

### Status Badge

```tsx
<StatusBadge status="active" color="green">
  ONLINE
</StatusBadge>
```

---

**Design System Version:** 1.0.0
**Last Updated:** 2026-02-15
**Maintained by:** Volta OS Team
