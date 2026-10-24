import type { Metadata } from 'next';
import { CarouselsApp } from '@/components/media/CarouselsApp';

export const metadata: Metadata = { title: 'VOLTA Carousels · VOLTA Agentic OS' };

export default function CarouselsPage() {
  return <CarouselsApp />;
}
