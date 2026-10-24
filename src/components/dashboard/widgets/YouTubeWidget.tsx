'use client';

// Not mounted anywhere. YouTube is not connected to VOLTA OS (see the "YouTube" row of /api/sources), so this
// panel shows no channel numbers at all — it used to render mock subscriber/view counts from lib/mock-data.
// Kept as an honest placeholder so a stale import (or a future mount) can't bring the fake numbers back.

import { Play } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';

export function YouTubeWidget({ className }: { className?: string }) {
  return (
    <HudPanel
      title="YOUTUBE STUDIO"
      icon={<Play size={12} strokeWidth={0} fill="currentColor" />}
      headerExtra={<span className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] text-muted">NOT CONNECTED</span>}
      className={className}
      bodyClassName="flex flex-col items-start justify-center gap-1.5 px-3 py-2.5"
    >
      <span className="hud-label text-[10px] text-amber">NO CHANNEL DATA</span>
      <p className="selectable text-[11.5px] leading-snug text-secondary">
        YouTube isn&apos;t connected. Add <code className="font-mono text-paper">YOUTUBE_API_KEY</code> and{' '}
        <code className="font-mono text-paper">YOUTUBE_CHANNEL_ID</code> to <code className="font-mono text-paper">.env.local</code>.
      </p>
    </HudPanel>
  );
}
