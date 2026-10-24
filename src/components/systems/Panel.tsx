'use client';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Panel({ id, title, icon: Icon, meta, children, className, highlighted }: { id: string; title: string; icon: LucideIcon; meta?: ReactNode; children: ReactNode; className?: string; highlighted?: boolean }) {
  return (
    <section id={id} className={cn('hud-card flex min-w-0 scroll-mt-4 flex-col gap-3.5 p-4 transition-shadow', highlighted && 'ring-2 ring-orange/60', className)}>
      <header className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-orange" />
        <h2 className="hud-label">{title}</h2>
        {meta && <span className="ml-auto truncate font-mono text-[10px] text-muted">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
