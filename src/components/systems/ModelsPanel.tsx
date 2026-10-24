'use client';
import { Cpu } from 'lucide-react';
import type { LocalModel, ModelRuntime } from '@/types/systems';
import { cn } from '@/lib/cn';
import { StatusDot } from './ServiceCard';
import { Panel } from './Panel';
import { STATUS_TEXT, formatBytes, formatDuration } from './format';

function until(iso: string | null, now: number | null): string | null {
  if (!iso || now == null) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms)) return null;
  // Ollama reports a far-future expiry for keep_alive = -1.
  if (ms > 365 * 86_400_000) return 'kept loaded';
  return ms <= 0 ? 'unloading' : `unloads in ${formatDuration(ms / 1000)}`;
}

function ModelRow({ m, now }: { m: LocalModel; now: number | null }) {
  const unload = m.remoteHost ? null : m.ttlSec != null ? `unloads in ${formatDuration(m.ttlSec)} idle` : until(m.expiresAt, now);
  return (
    <li className="flex flex-col gap-0.5 rounded-md border border-subtle bg-obsidian/60 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-paper" title={m.id}>
          {m.name ?? m.id}
        </span>
        {m.sizeBytes != null && (
          <span className="shrink-0 font-mono text-[11px] text-secondary" title={m.sizeKind === 'memory' ? 'resident size reported by Ollama' : 'model file size on disk'}>
            {formatBytes(m.sizeBytes)}
            <span className="text-muted"> {m.sizeKind === 'memory' ? 'in memory' : 'on disk'}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-2.5 font-mono text-[9.5px] text-muted">
        {m.type && <span>{m.type}</span>}
        {m.params && <span>{m.params}</span>}
        {m.quantization && <span>{m.quantization}</span>}
        {m.contextLength != null && <span>ctx {m.contextLength.toLocaleString('en-US')}</span>}
        {m.remoteHost && <span className="text-secondary">cloud · runs on {m.remoteHost}</span>}
        {m.vramBytes != null && m.vramBytes > 0 && <span>GPU {formatBytes(m.vramBytes)}</span>}
        {unload && <span className="text-secondary">{unload}</span>}
      </div>
    </li>
  );
}

/** Ollama cloud models: registry stubs that run remotely — listed apart so they never count as local installs. */
function CloudList({ models }: { models: LocalModel[] }) {
  if (!models.length) return null;
  return (
    <details className="group pl-4">
      <summary className="cursor-pointer list-none font-mono text-[10px] text-muted hover:text-paper" title="Registry stubs for models that run remotely — no local disk or memory">
        <span className="group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span> {models.length} cloud model{models.length === 1 ? '' : 's'} ({models[0].remoteHost ?? 'remote'}) · not local
      </summary>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {models.map((m) => (
          <li key={m.id} className="flex items-baseline gap-2 font-mono text-[10px]">
            <span className="min-w-0 flex-1 truncate text-secondary" title={m.id}>
              {m.name ?? m.id}
            </span>
            <span className="text-muted">cloud</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ModelsPanel({ runtimes, now, highlighted }: { runtimes: ModelRuntime[]; now: number | null; highlighted?: boolean }) {
  const loaded = runtimes.reduce((n, r) => n + r.loaded.length, 0);
  return (
    <Panel id="models" title="Local models" icon={Cpu} highlighted={highlighted} meta={`${loaded} loaded`}>
      <div className="flex flex-col gap-4">
        {runtimes.map((r) => (
          <div key={r.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <StatusDot status={r.status} />
              <span className="text-[13px] font-semibold text-paper">{r.name}</span>
              <span className="font-mono text-[10px] text-muted">:{r.port}</span>
              {r.servedBy && r.servedBy.toLowerCase() !== r.id && <span className="font-mono text-[10px] text-muted">· served by {r.servedBy}</span>}
              <span className={cn('ml-auto font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em]', STATUS_TEXT[r.status])}>{r.status}</span>
            </div>
            {r.status === 'down' ? (
              <p className="pl-4 font-mono text-[10.5px] text-muted">{r.error ?? 'not answering'}</p>
            ) : (
              <>
                {r.loaded.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {r.loaded.map((m) => (
                      <ModelRow key={m.id} m={m} now={now} />
                    ))}
                  </ul>
                ) : (
                  <p className="pl-4 text-[11.5px] text-muted">No model loaded{r.error ? ` · ${r.error}` : ''}</p>
                )}
                {r.cloud.some((m) => m.loaded) && (
                  <ul className="flex flex-col gap-1.5">
                    {r.cloud
                      .filter((m) => m.loaded)
                      .map((m) => (
                        <ModelRow key={m.id} m={m} now={now} />
                      ))}
                  </ul>
                )}
                {r.available.length > 0 && (
                  <details className="group pl-4">
                    <summary className="cursor-pointer list-none font-mono text-[10px] text-muted hover:text-paper">
                      <span className="group-open:hidden">▸</span>
                      <span className="hidden group-open:inline">▾</span> {r.available.length} installed, not loaded
                    </summary>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {r.available.slice(0, 40).map((m) => (
                        <li key={m.id} className="flex items-baseline gap-2 font-mono text-[10px]">
                          <span className="min-w-0 flex-1 truncate text-secondary" title={m.id}>
                            {m.name ?? m.id}
                          </span>
                          {m.params && <span className="text-muted">{m.params}</span>}
                          {m.sizeBytes != null && <span className="text-muted">{formatBytes(m.sizeBytes)}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <CloudList models={r.cloud.filter((m) => !m.loaded)} />
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
