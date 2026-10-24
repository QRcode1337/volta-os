import type { Metadata } from 'next';
import { LtmApp } from '@/components/ltm/LtmApp';

export const metadata: Metadata = {
  title: 'LTM',
  description: 'Browse and search unvolta-ltm screen captures — timeline, OCR text, screenshots and Pieces-Vault summaries.',
};

export default function LtmPage() {
  return <LtmApp />;
}
