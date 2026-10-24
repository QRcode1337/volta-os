'use client';
// Small shared bits for the home left column: source status dot + setup-hint copy button.

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { SourceStatus } from '@/types/sources';
import { cn } from '@/lib/cn';

export const STATUS_META: Record<SourceStatus, { label: string; color: string; pulse: boolean; hollow: boolean }> = {
  live: { label: 'Live', color: '#22C55E', pulse: true, hollow: false },
  idle: { label: 'Idle', color: '#F5A623', pulse: false, hollow: false },
  stale: { label: 'Stale', color: '#F5A623', pulse: false, hollow: true },
  offline: { label: 'Offline', color: '#EF4444', pulse: false, hollow: false },
  'not-connected': { label: 'Not connected', color: '#6E6A61', pulse: false, hollow: true },
};

const PULSE_CSS =
  '@keyframes left-live-pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}50%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}';

export function StatusDot({ status, className }: { status: SourceStatus; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.offline;
  return (
    <>
      {m.pulse && (
        <style href="volta-left-live-pulse" precedence="default">
          {PULSE_CSS}
        </style>
      )}
      <span
        aria-label={m.label}
        role="img"
        className={cn('inline-block h-[7px] w-[7px] shrink-0 rounded-full', className)}
        style={
          m.hollow
            ? { boxShadow: `inset 0 0 0 1.5px ${m.color}` }
            : {
                background: m.color,
                ...(m.pulse ? { animation: 'left-live-pulse 1.8s ease-in-out infinite' } : { boxShadow: `0 0 6px ${m.color}66` }),
              }
        }
      />
    </>
  );
}

/** `Add YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID to .env.local` → "YOUTUBE_API_KEY=\nYOUTUBE_CHANNEL_ID=" */
export function envStubs(hint: string): string | null {
  if (!/\.env/.test(hint)) return null;
  const names = [...new Set(hint.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? [])];
  return names.length ? names.map((n) => `${n}=`).join('\n') : null;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Tiny copy button for a setup hint. Copies `.env.local` stubs when the hint names env vars, else the hint. */
export function CopyHintButton({ hint, className }: { hint: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const stubs = envStubs(hint);
  const payload = stubs ?? hint;
  const label = stubs ? `Copy ${stubs.replace(/\n/g, ' ')} for .env.local` : 'Copy setup hint';

  const onClick = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await writeClipboard(payload);
    setState(ok ? 'ok' : 'fail');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1600);
  };

  const Icon = state === 'ok' ? Check : state === 'fail' ? X : Copy;
  return (
    <button
      type="button"
      onClick={onClick}
      title={state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}
      aria-label={label}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border border-subtle bg-panel-elevated transition-colors hover:border-highlight hover:bg-panel-hover',
        state === 'ok' ? 'text-[#22C55E]' : state === 'fail' ? 'text-[#EF4444]' : 'text-muted hover:text-paper',
        className,
      )}
    >
      <Icon size={10} strokeWidth={2.4} />
    </button>
  );
}
