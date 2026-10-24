'use client';
import { Brain, Copy, PlugZap, RefreshCw, Terminal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { START_COMMAND } from './honcho-client';

interface Props {
  url: string | null;
  error: string | null;
  retrying: boolean;
  secondsLeft: number;
  onRetry: () => void;
  onCopy: (text: string, what: string) => void;
}

export function HonchoOffline({ url, error, retrying, secondsLeft, onRetry, onCopy }: Props) {
  return (
    <div className="hud-scroll flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-[560px]">
        <div className="hud-card relative overflow-hidden p-7">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(255,85,0,0.35), transparent 70%)' }}
          />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-subtle bg-panel-elevated">
              <PlugZap className="h-5 w-5 text-orange" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#EF4444]" />
                <span className="hud-label text-[10px]">Offline</span>
              </div>
              <h2 className="mt-0.5 text-[20px] font-bold tracking-tight text-paper">Honcho is offline</h2>
            </div>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-secondary">
            Honcho is the self-hosted memory server (Plastic Labs) that your agents write peers, sessions and messages into. Its deriver
            turns those into conclusions, peer cards and representations. It runs in Docker and has no UI of its own — this app is its
            GUI. Start the stack, and this page connects automatically.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-muted" />
              <span className="hud-label text-[10px]">Start command</span>
            </div>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-subtle bg-obsidian">
              <code className="selectable hud-scroll flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-paper">
                {START_COMMAND}
              </code>
              <button
                type="button"
                onClick={() => onCopy(START_COMMAND, 'start command')}
                className="flex items-center gap-1.5 border-l border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:bg-panel-hover hover:text-paper"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted">
              First boot runs migrations; the API answers on {url ?? 'http://127.0.0.1:8000'} once the <span className="text-secondary">api</span>{' '}
              container is healthy. <span className="text-secondary">docker compose ps</span> shows progress.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-md border border-subtle bg-panel-elevated px-3 py-2 font-mono text-[10.5px] text-muted">
              <span className="text-secondary">Last error:</span> {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="flex items-center gap-2 rounded-full bg-orange px-4 py-1.5 font-mono text-[11px] font-semibold uppercase text-obsidian disabled:opacity-60"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', retrying && 'robo-spin')} />
              {retrying ? 'Checking…' : 'Retry'}
            </button>
            <span className="font-mono text-[10px] text-muted">
              {retrying ? 'Probing /health…' : `Auto-retry in ${secondsLeft}s`}
            </span>
            <Brain className="ml-auto h-4 w-4 text-muted" />
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] text-muted">Everything stays local · proxied through 127.0.0.1 only</p>
      </div>
    </div>
  );
}
