import type { Metadata } from 'next';
import { StudioApp } from '@/components/studio/StudioApp';

export const metadata: Metadata = { title: 'Studio · VOLTA Agentic OS' };

export default function StudioPage() {
  return <StudioApp />;
}
