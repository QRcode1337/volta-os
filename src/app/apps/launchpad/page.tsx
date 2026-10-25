import type { Metadata } from 'next';
import { LaunchpadApp } from '@/components/launchpad/LaunchpadApp';

export const metadata: Metadata = { title: 'Launchpad · VOLTA Agentic OS' };

export default function LaunchpadPage() {
  return <LaunchpadApp />;
}
