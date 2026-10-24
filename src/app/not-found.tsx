import Link from 'next/link';
import { PixelMascotLogo } from '@/components/robo-ui';

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-obsidian p-6">
      <div className="hud-card relative flex w-full max-w-md flex-col items-center gap-4 px-8 py-10 text-center">
        <span className="hud-label absolute left-4 top-3">ERR · ROUTE_NOT_FOUND</span>
        <span className="absolute right-4 top-3 h-2 w-2 rounded-full bg-orange robo-pulse" aria-hidden />
        <PixelMascotLogo size={72} />
        <div className="font-doto text-7xl font-bold leading-none text-orange">404</div>
        <div>
          <h1 className="text-xl font-bold text-paper">
            Signal <span className="font-doto text-orange">lost</span>
          </h1>
          <p className="mt-2 text-sm text-secondary">
            The mascot searched every node in the Second Brain and couldn&apos;t find this route.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-8 items-center rounded-full border border-orange bg-orange px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-obsidian transition hover:brightness-110"
        >
          ← Back to VOLTA OS
        </Link>
      </div>
    </div>
  );
}
