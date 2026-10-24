'use client';
import { useEffect, useRef } from 'react';
import { ASPECT_BY_ID } from './data';
import { drawGen, type ArtInput } from './art';
import { cn } from '@/lib/cn';

export interface ArtCanvasProps {
  item: ArtInput;
  /** Internal render width in px (height follows the aspect). */
  width?: number;
  /** 'hover' plays the loop only while `playing` is true; 'always' loops continuously. */
  mode?: 'still' | 'playing';
  className?: string;
}

/** Draws a generation into a canvas client-side (after mount → no hydration drift). */
export function ArtCanvas({ item, width = 640, mode = 'still', className }: ArtCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const a = ASPECT_BY_ID[item.aspect];
  const height = Math.round((width * a.h) / a.w);
  const { prompt, seed, variant, aspect, mediaType } = item;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const input: ArtInput = { prompt, seed, variant, aspect, mediaType };
    let raf = 0;
    let cancelled = false;
    const still = () => drawGen(ctx, canvas.width, canvas.height, input, 0);

    if (mode === 'playing' && mediaType === 'animation') {
      const start = performance.now();
      const loop = (now: number) => {
        if (cancelled) return;
        drawGen(ctx, canvas.width, canvas.height, input, 0.001 + (now - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      still();
      // Re-draw once webfonts (Outfit/Doto/Newsreader) finish loading.
      document.fonts?.ready.then(() => !cancelled && still()).catch(() => undefined);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [prompt, seed, variant, aspect, mediaType, mode, width, height]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={cn('block h-auto w-full', className)}
      style={{ aspectRatio: `${a.w} / ${a.h}` }}
    />
  );
}
