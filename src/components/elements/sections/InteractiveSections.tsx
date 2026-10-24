'use client';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { EMAIL_MIX } from '@/lib/mock-data';
import { ModelEffortBadge } from '@/components/robo-ui';
import { EditableMixBar } from '../library/MixBar';
import { MetricHero } from '../library/MetricHero';
import { RlToggle } from '../library/RlToggle';
import { RoutingMatrix } from '../library/RoutingMatrix';
import type { Route } from '../library/RoutingMatrix';
import { SpatialPinFrame } from '../library/SpatialPinFrame';
import { MetricHeroSource, MixBarSource, RlToggleSource, RoutingMatrixSource, SpatialPinFrameSource } from '../snippets/library-sources';
import { Specimen, useNotify } from '../Specimen';
import type { SpecimenCode } from '../Specimen';

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Doto:wght@700&family=JetBrains+Mono:wght@500;600;700&family=Outfit:wght@400;600&display=swap');";

// ───────────────────────── 4 · Routing matrix ─────────────────────────

const MATRIX_CODE: SpecimenCode = {
  tsx: `${RoutingMatrixSource}
// <RoutingMatrix defaultValue={{ model: 'SONNET', effort: 'HIGH' }} onChange={(r) => console.log(r)} />`,
  html: `<style>
  ${FONTS}
  .matrix { display: grid; grid-template-columns: 84px repeat(5, minmax(0, 1fr)); gap: 4px; font-family: 'JetBrains Mono', monospace; }
  .matrix__head { text-align: center; font-size: 9.5px; font-weight: 600; letter-spacing: .08em; color: #6E6A61; padding: 4px 0; }
  .matrix__model { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; color: #A39E93; }
  .matrix__model i { width: 7px; height: 7px; border-radius: 999px; background: var(--c); }
  .cell { height: 38px; border-radius: 6px; border: 1px solid #262522; background: #1C1B19; color: #6E6A61;
    font: 600 10px/1 'JetBrains Mono', monospace; cursor: pointer; transition: all .15s; }
  .cell:hover { border-color: #3A3834; background: #24221F; }
  .cell[aria-selected='true'] { border-color: var(--c); color: #F5F2EB;
    background: color-mix(in srgb, var(--c) 18%, transparent); box-shadow: 0 0 16px color-mix(in srgb, var(--c) 33%, transparent); }
  .readout { margin-top: 14px; display: flex; gap: 14px; align-items: center; padding: 10px 12px;
    border: 1px solid #262522; border-radius: 8px; background: #0A0A0A; color: #F5F2EB; font: 700 22px/1 'Doto', monospace; }
</style>

<div class="matrix" id="matrix"></div>
<div class="readout" id="readout"></div>

<script>
  const MODELS = { HAIKU: ['#22C55E', 0.004, 1.2], SONNET: ['#14B8A6', 0.018, 3.4], OPUS: ['#A855F7', 0.09, 7.8], FABLE: ['#F5A623', 0.032, 4.6] };
  const EFFORTS = { LOW: 0.6, MEDIUM: 1, HIGH: 1.8, XHIGH: 3, MAX: 5 };
  const usd = (n) => '$' + n.toFixed(n < 0.01 ? 4 : 3);
  const el = document.getElementById('matrix');
  let sel = ['SONNET', 'HIGH'];

  function render() {
    el.innerHTML = '<span></span>' + Object.keys(EFFORTS).map((e) => \`<span class="matrix__head">\${e}</span>\`).join('');
    for (const [m, [color, base]] of Object.entries(MODELS)) {
      el.insertAdjacentHTML('beforeend', \`<span class="matrix__model" style="--c:\${color}"><i></i>\${m}</span>\`);
      for (const [e, x] of Object.entries(EFFORTS)) {
        const on = sel[0] === m && sel[1] === e;
        el.insertAdjacentHTML('beforeend',
          \`<button class="cell" style="--c:\${color}" aria-selected="\${on}" data-m="\${m}" data-e="\${e}">\${usd(base * x)}</button>\`);
      }
    }
    const [color, base, sec] = MODELS[sel[0]];
    const x = EFFORTS[sel[1]];
    document.getElementById('readout').innerHTML =
      \`<span style="color:\${color};font:600 10px 'JetBrains Mono'">● \${sel[0]} · \${sel[1]}</span>\${usd(base * x)}
       <small style="font:500 10px 'JetBrains Mono';color:#6E6A61">/ run · ~\${(sec * Math.pow(x, 0.8)).toFixed(1)}s</small>\`;
  }
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('.cell');
    if (b) { sel = [b.dataset.m, b.dataset.e]; render(); }
  });
  render();
</script>`,
};

export function RoutingSection() {
  const [route, setRoute] = useState<Route>({ model: 'SONNET', effort: 'HIGH' });
  return (
    <Specimen
      id="routing-matrix"
      title="Model × Effort routing matrix"
      description="Pick the model tier and effort for a skill. Arrow keys move the selection; hovering draws a row/column crosshair. Costs are illustrative per-run estimates."
      code={MATRIX_CODE}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-6">
        <RoutingMatrix defaultValue={route} onChange={setRoute} />
        <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-panel p-4">
          <span className="hud-label">Bound to skill</span>
          <span className="font-mono text-[13px] text-paper">/animate</span>
          <ModelEffortBadge model={route.model} effort={route.effort} size="md" className="self-start" />
          <p className="text-[11.5px] leading-relaxed text-muted">
            The selection feeds <code className="font-mono text-[10.5px] text-secondary">SkillRunRequest.model / effort</code> — the same pair the skills deck sends to{' '}
            <code className="font-mono text-[10.5px] text-secondary">/api/skills/run</code>.
          </p>
        </div>
      </div>
    </Specimen>
  );
}

// ───────────────────────── 5 · Metrics & mix bars ─────────────────────────

const HERO_CODE: SpecimenCode = {
  tsx: `${MetricHeroSource}
// <MetricHero label="Workspace files" value={424846} caption="Indexed into the Second Brain" />
// <MetricHero label="Jev spend · week" value={0.18} decimals={2} prefix="$" color="#22C55E" />`,
  html: `<style>
  ${FONTS}
  .metric { background: #141413; border: 1px solid #262522; border-radius: 10px; padding: 14px 16px; }
  .metric__label { font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: .08em; text-transform: uppercase; color: #A39E93; }
  .metric__value { margin-top: 12px; font: 700 40px/1 'Doto', monospace; letter-spacing: .02em; color: #F5F2EB; font-variant-numeric: tabular-nums; }
</style>

<div class="metric">
  <div class="metric__label">Workspace files</div>
  <div class="metric__value" data-count="424846" data-decimals="0">0</div>
</div>

<script>
  // easeOutCubic count-up for every [data-count]
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count), decimals = Number(el.dataset.decimals || 0);
    const start = performance.now(), dur = 1400;
    const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    (function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = (el.dataset.prefix || '') + fmt(target * (1 - Math.pow(1 - t, 3))) + (el.dataset.suffix || '');
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  });
</script>`,
};

const MIX_CODE: SpecimenCode = {
  tsx: `${MixBarSource}
// <EditableMixBar initial={[
//   { label: 'PARTNERS', value: 9, color: '#FF5500' },
//   { label: 'LEADS', value: 14, color: '#F5A623' },
//   { label: 'PERSONAL', value: 6, color: '#22C55E' },
//   { label: 'OTHER', value: 18, color: '#3A3834' },
// ]} />`,
  html: `<style>
  ${FONTS}
  .mix { display: flex; gap: 2px; height: 10px; border-radius: 999px; overflow: hidden; background: #1C1B19; }
  .mix > span { transition: width .3s cubic-bezier(.16, 1, .3, 1); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; font: 600 10px/1 'JetBrains Mono', monospace; color: #A39E93; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
  .legend b { color: #F5F2EB; font-weight: 600; }
  .editor { display: grid; gap: 10px; margin-top: 14px; }
  .editor label { display: grid; grid-template-columns: 84px 1fr; gap: 10px; align-items: center; font: 600 10px/1 'JetBrains Mono', monospace; color: #A39E93; }
</style>

<div class="mix" id="mix"></div>
<div class="legend" id="legend"></div>
<div class="editor" id="editor"></div>

<script>
  const segs = [
    { label: 'PARTNERS', value: 9, color: '#FF5500' },
    { label: 'LEADS', value: 14, color: '#F5A623' },
    { label: 'PERSONAL', value: 6, color: '#22C55E' },
    { label: 'OTHER', value: 18, color: '#3A3834' },
  ];
  const mix = document.getElementById('mix');
  const legend = document.getElementById('legend');
  const editor = document.getElementById('editor');
  function render() {
    const total = segs.reduce((a, s) => a + s.value, 0) || 1;
    mix.innerHTML = segs.filter((s) => s.value > 0)
      .map((s) => \`<span style="width:\${(s.value / total) * 100}%;background:\${s.color}"></span>\`).join('');
    legend.innerHTML = segs
      .map((s) => \`<span><i style="background:\${s.color}"></i>\${s.label} <b>\${Math.round((s.value / total) * 100)}%</b></span>\`).join('');
  }
  editor.innerHTML = segs
    .map((s, i) => \`<label>\${s.label}<input type="range" min="0" max="40" value="\${s.value}" data-i="\${i}" style="accent-color:\${s.color}"></label>\`).join('');
  editor.addEventListener('input', (e) => { segs[e.target.dataset.i].value = Number(e.target.value); render(); });
  render();
</script>`,
};

export function MetricsSection() {
  const [run, setRun] = useState(0);
  return (
    <>
      <Specimen
        id="metric-heroes"
        title="Doto metric hero counters"
        description="Count-up on mount with easeOutCubic (1.4s). Replay re-runs the animation via runKey."
        code={HERO_CODE}
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
          >
            <RotateCcw className="h-3 w-3" /> Replay
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MetricHero label="Workspace files" value={424_846} caption="Indexed into the Second Brain" runKey={run} />
          <MetricHero label="Jev routes · week" value={4_451} caption="41% handled by Haiku" color="#FF5500" runKey={run} />
          <MetricHero label="Jev spend · week" value={0.18} decimals={2} prefix="$" caption="vs $31.40 all-Opus" color="#22C55E" runKey={run} />
        </div>
      </Specimen>

      <Specimen id="mix-bars" title="Segmented mix bars" description="Proportional segments with a live % legend. Drag a slider or type a value — the bar re-flows." code={MIX_CODE}>
        <div className="max-w-[560px]">
          <EditableMixBar initial={EMAIL_MIX.map((m) => ({ label: m.label, value: m.count, color: m.color }))} />
        </div>
      </Specimen>
    </>
  );
}

// ───────────────────────── 6 · Pins & RL toggles ─────────────────────────

const PIN_CODE: SpecimenCode = {
  tsx: `${SpatialPinFrameSource}
// <SpatialPinFrame initialPins={[{ n: 1, x: 64.2, y: 38.5 }]} />`,
  html: `<style>
  ${FONTS}
  .frame { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 10px; border: 1px solid #262522;
    cursor: crosshair; background: radial-gradient(ellipse at 60% 40%, #24221F 0%, #0A0A0A 70%); }
  .frame::before { content: ''; position: absolute; inset: 0; background-size: 33.333% 33.333%;
    background-image: linear-gradient(#26252299 1px, transparent 1px), linear-gradient(90deg, #26252299 1px, transparent 1px); }
  .xh { position: absolute; background: rgba(255, 85, 0, .4); }
  .pin { position: absolute; transform: translate(-50%, -50%); }
  .pin::before { content: ''; position: absolute; inset: -6px; border-radius: 999px; border: 2px solid #FF5500;
    animation: pin-pulse 1.6s ease-out infinite; }
  .pin span { position: relative; display: flex; width: 24px; height: 24px; align-items: center; justify-content: center;
    border-radius: 999px; background: #FF5500; color: #0A0A0A; font: 700 11px/1 'JetBrains Mono', monospace;
    box-shadow: 0 0 0 3px rgba(10, 10, 10, .8), 0 0 16px rgba(255, 85, 0, .7); }
  .coords { position: absolute; left: 12px; bottom: 10px; font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: .06em; color: #A39E93; }
  @keyframes pin-pulse { 0% { transform: scale(.6); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
</style>

<div class="frame" id="frame">
  <div class="xh" id="xh-h" style="left:0;right:0;height:1px;display:none"></div>
  <div class="xh" id="xh-v" style="top:0;bottom:0;width:1px;display:none"></div>
  <span class="coords" id="coords">CLICK TO DROP A PIN</span>
</div>

<script>
  const frame = document.getElementById('frame');
  let n = 0;
  frame.addEventListener('click', (e) => {
    const r = frame.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    n += 1;
    frame.insertAdjacentHTML('beforeend', \`<div class="pin" style="left:\${x}%;top:\${y}%"><span>\${n}</span></div>\`);
    Object.assign(document.getElementById('xh-h').style, { top: y + '%', display: 'block' });
    Object.assign(document.getElementById('xh-v').style, { left: x + '%', display: 'block' });
    document.getElementById('coords').textContent = \`PIN #\${n} · x: \${x}% · y: \${y}%\`;
  });
</script>`,
};

const TOGGLE_CODE: SpecimenCode = {
  tsx: `${RlToggleSource}
// <RlToggle label="Teach my /cut" hint="Appends RL rules to workspace/skills/cut/SKILL.md" defaultOn />
// <RlToggle label="Teach my /animate" hint="Appends RL rules to workspace/skills/animate/SKILL.md" />`,
  html: `<style>
  ${FONTS}
  .rl { display: inline-flex; align-items: center; gap: 10px; height: 34px; padding: 0 14px 0 6px; border-radius: 999px;
    border: 1px solid #262522; background: #1C1B19; color: #A39E93; cursor: pointer;
    font: 600 11px/1 'JetBrains Mono', monospace; letter-spacing: .04em; transition: all .2s cubic-bezier(.16, 1, .3, 1); }
  .rl__track { position: relative; width: 36px; height: 22px; border-radius: 999px; background: #3A3834; transition: background .2s; }
  .rl__knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 999px; background: #F5F2EB;
    transition: left .2s cubic-bezier(.16, 1, .3, 1); }
  .rl[aria-checked='true'] { border-color: rgba(34, 197, 94, .55); background: rgba(34, 197, 94, .08); color: #F5F2EB;
    box-shadow: 0 0 18px rgba(34, 197, 94, .28), inset 0 0 12px rgba(34, 197, 94, .08); }
  .rl[aria-checked='true'] .rl__track { background: #22C55E; }
  .rl[aria-checked='true'] .rl__knob { left: 17px; box-shadow: 0 0 10px rgba(34, 197, 94, .95); }
</style>

<button class="rl" role="switch" aria-checked="true" title="Appends RL rules to workspace/skills/cut/SKILL.md">
  <span class="rl__track"><span class="rl__knob"></span></span>Teach my /cut
</button>
<button class="rl" role="switch" aria-checked="false" title="Appends RL rules to workspace/skills/animate/SKILL.md">
  <span class="rl__track"><span class="rl__knob"></span></span>Teach my /animate
</button>

<script>
  document.querySelectorAll('.rl').forEach((b) =>
    b.addEventListener('click', () => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true'))),
  );
</script>`,
};

export function PinsTogglesSection() {
  const notify = useNotify();
  const [teach, setTeach] = useState({ cut: true, animate: false });
  const active = Object.entries(teach)
    .filter(([, on]) => on)
    .map(([k]) => `/${k}`);

  return (
    <>
      <Specimen
        id="spatial-pin"
        title="Spatial video pin"
        description="Click anywhere on the 16:9 frame to drop a numbered pin. Coordinates are normalized 0–100% so they survive any player size."
        code={PIN_CODE}
      >
        <div className="mx-auto max-w-[720px]">
          <SpatialPinFrame initialPins={[{ n: 1, x: 64.2, y: 38.5 }]} />
        </div>
      </Specimen>

      <Specimen
        id="rl-toggles"
        title="RL toggle switches"
        description={
          <>
            <code className="font-mono text-[11px]">role=&quot;switch&quot;</code> pills with a glowing green on-state. Used by VOLTA Editor to attach self-improvement directives.
          </>
        }
        code={TOGGLE_CODE}
      >
        <div className="flex flex-wrap items-center gap-3">
          <RlToggle
            label="Teach my /cut"
            hint="Appends reinforcement learning rules to workspace/skills/cut/SKILL.md"
            defaultOn
            onChange={(on) => {
              setTeach((t) => ({ ...t, cut: on }));
              notify(`Teach my /cut ${on ? 'ON' : 'OFF'}`);
            }}
          />
          <RlToggle
            label="Teach my /animate"
            hint="Appends reinforcement learning rules to workspace/skills/animate/SKILL.md"
            onChange={(on) => {
              setTeach((t) => ({ ...t, animate: on }));
              notify(`Teach my /animate ${on ? 'ON' : 'OFF'}`);
            }}
          />
        </div>
        <p className="mt-4 font-mono text-[10.5px] tracking-[0.04em] text-muted">
          RL directives attached to the next prompt:{' '}
          <span className={active.length ? 'text-green' : 'text-secondary'}>{active.length ? active.join(' + ') : 'none'}</span>
        </p>
      </Specimen>
    </>
  );
}
