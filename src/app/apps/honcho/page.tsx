import type { Metadata } from 'next';
import { HonchoApp } from '@/components/honcho/HonchoApp';

export const metadata: Metadata = {
  title: 'Honcho',
  description: 'GUI for the self-hosted Honcho memory server — peers, sessions, conclusions, search and dialectic chat.',
};

export default function HonchoPage() {
  return <HonchoApp />;
}
