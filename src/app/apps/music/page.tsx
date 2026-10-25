import type { Metadata } from 'next';
import { MusicApp } from '@/components/music/MusicApp';

export const metadata: Metadata = { title: 'VOLTA Music · VOLTA Agentic OS' };

export default function MusicPage() {
  return <MusicApp />;
}
