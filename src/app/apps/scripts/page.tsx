import type { Metadata } from 'next';
import { ScriptsApp } from '@/components/scripts/ScriptsApp';

export const metadata: Metadata = { title: 'VOLTA Scripts · VOLTA Agentic OS' };

export default function ScriptsPage() {
  return <ScriptsApp />;
}
