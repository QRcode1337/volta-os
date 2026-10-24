import type { Metadata } from 'next';
import { ElementsApp } from '@/components/elements/ElementsApp';

export const metadata: Metadata = { title: 'Elements · /robo UI library · VOLTA Agentic OS' };

export default function ElementsPage() {
  return <ElementsApp />;
}
