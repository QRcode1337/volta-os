import type { Metadata } from 'next';
import { RecosApp } from '@/components/recos/RecosApp';

export const metadata: Metadata = {
  title: 'VOLTA Recos · Weekly Improvement Store',
  description: 'Weekly self-improvement recommendations for the VOLTA Agentic OS workspace.',
};

export default function RecosPage() {
  return <RecosApp />;
}
