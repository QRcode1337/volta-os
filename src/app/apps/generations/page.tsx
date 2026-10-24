import type { Metadata } from 'next';
import { GenerationsApp } from '@/components/media/GenerationsApp';

export const metadata: Metadata = { title: 'Generations · VOLTA Agentic OS' };

export default function GenerationsPage() {
  return <GenerationsApp />;
}
