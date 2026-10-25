import type { Metadata } from 'next';
import { ResearchApp } from '@/components/research/ResearchApp';

export const metadata: Metadata = { title: 'VOLTA Research · VOLTA Agentic OS' };

export default function ResearchPage() {
  return <ResearchApp />;
}
