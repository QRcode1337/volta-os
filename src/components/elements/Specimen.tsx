'use client';
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { copyText } from './kit/clipboard';
import { highlight } from './highlight';

type Notify = (message: string, tone?: 'default' | 'success' | 'error') => void;
export const NotifyContext = createContext<Notify>(() => {});
export const useNotify = () => useContext(NotifyContext);

export interface SpecimenCode {
  tsx: string;
  html: string;
}

interface SpecimenProps {
  id: string;
  title: string;
  description?: ReactNode;
  code: SpecimenCode;
  /** Classes for the preview stage. */
  stageClassName?: string;
  children: ReactNode;
}

const TABS = [
  { key: 'tsx', label: 'React / TSX', file: 'tsx' },
  { key: 'html', label: 'HTML / CSS', file: 'html' },
] as const;

export function Specimen({ id, title, description, code, stageClassName, children }: SpecimenProps) {
  return (
    <article id={id} className="scroll-mt-4 overflow-hidden rounded-xl border border-subtle bg-panel">
      <header className="flex items-start gap-3 border-b border-subtle px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-paper">{title}</h3>
          {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-secondary">{description}</p>}
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-subtle bg-obsidian px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
          live
        </span>
      </header>
      <div
        className={cn('relative p-6', stageClassName)}
        style={{
          backgroundColor: '#0D0D0C',
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(245,242,235,0.05) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }}
      >
        {children}
      </div>
      <CodePanel title={title} code={code} />
    </article>
  );
}

export function CodePanel({ title, code }: { title: string; code: SpecimenCode }) {
  const [tab, setTab] = useState<'tsx' | 'html'>('tsx');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const notify = useNotify();
  const source = code[tab];
  const lines = useMemo(() => source.split('\n').length, [source]);
  const nodes = useMemo(() => highlight(source), [source]);
  const collapsible = lines > 16;

  const onCopy = async () => {
    const ok = await copyText(source);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      notify(`Copied ${TABS.find((t) => t.key === tab)?.label} snippet · ${title}`, 'success');
    } else {
      notify('Clipboard unavailable — select the code manually.', 'error');
    }
  };

  return (
    <div className="border-t border-subtle bg-[#0B0B0A]">
      <div className="flex h-10 items-center gap-1 border-b border-subtle px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              'relative h-10 px-2.5 font-mono text-[10.5px] font-semibold tracking-[0.04em] transition-colors',
              tab === t.key ? 'text-paper' : 'text-muted hover:text-secondary',
            )}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-orange" />}
          </button>
        ))}
        <span className="ml-2 font-mono text-[9.5px] text-muted">{lines} lines</span>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            'ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
            copied ? 'border-green/50 text-green' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={cn('relative', collapsible && !expanded && 'max-h-[300px] overflow-hidden')}>
        <div className="hud-scroll flex overflow-x-auto py-3 font-mono text-[11.5px] leading-[1.65]">
          <div aria-hidden className="sticky left-0 shrink-0 select-none bg-[#0B0B0A] pl-4 pr-3 text-right text-[#3A3834]">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className="selectable min-w-0 flex-1 pr-6 text-[#D9D4C7]">
            <code>{nodes}</code>
          </pre>
        </div>
        {collapsible && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0B0B0A] to-transparent" />}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-subtle py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:text-paper"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Collapse' : `Show all ${lines} lines`}
        </button>
      )}
    </div>
  );
}
