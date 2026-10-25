import type { Metadata } from 'next';
import { PodcastApp } from '@/components/podcast/PodcastApp';

export const metadata: Metadata = { title: 'VOLTA Briefing · VOLTA Agentic OS' };

export default function PodcastPage() {
  return <PodcastApp />;
}
