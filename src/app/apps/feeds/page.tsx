import type { Metadata } from 'next';
import { FeedsApp } from '@/components/feeds/FeedsApp';

export const metadata: Metadata = { title: 'Feeds · VOLTA Agentic OS' };

export default function FeedsPage() {
  return <FeedsApp />;
}
