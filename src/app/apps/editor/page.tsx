import type { Metadata } from 'next';
import { EditorShell } from '@/components/editor/EditorShell';

export const metadata: Metadata = { title: 'VOLTA Editor · VOLTA Agentic OS' };

export default function EditorPage() {
  return <EditorShell />;
}
