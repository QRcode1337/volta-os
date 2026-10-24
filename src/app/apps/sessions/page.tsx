import type { Metadata } from 'next';
import { SessionsApp } from '@/components/sessions/SessionsApp';

export const metadata: Metadata = {
  title: 'Sessions',
  description: 'Browse Claude Code projects and sessions — tokens, tools, skills, subagents, claude-mem observations and transcripts.',
};

export default function SessionsPage() {
  return <SessionsApp />;
}
