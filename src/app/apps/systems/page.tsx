import type { Metadata } from 'next';
import { SystemsApp } from '@/components/systems/SystemsApp';

export const metadata: Metadata = {
  title: 'Systems',
  description: 'Live health of the agent fleet, local services, local models, storage and memory pressure — read-only.',
};

export default function SystemsPage() {
  return <SystemsApp />;
}
