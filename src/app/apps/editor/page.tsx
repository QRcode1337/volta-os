import type { Metadata } from 'next';
import { EditorApp } from '@/components/editor/EditorApp';

export const metadata: Metadata = { title: 'VOLTA Editor · VOLTA Agentic OS' };

export default function EditorPage() {
  return <EditorApp />;
}
