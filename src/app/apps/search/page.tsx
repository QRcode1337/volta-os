import type { Metadata } from 'next';
import { SearchApp } from '@/components/search/SearchApp';

export const metadata: Metadata = {
  title: 'Search',
  description: 'One search across every memory source — LTM screen captures, Obsidian notes, claude-mem, Honcho, Notion, skills, routines and MCP servers.',
};

export default function SearchPage() {
  return <SearchApp />;
}
