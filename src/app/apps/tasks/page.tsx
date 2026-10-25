import type { Metadata } from 'next';
import { TasksApp } from '@/components/tasks/TasksApp';

export const metadata: Metadata = { title: 'Tasks · VOLTA Agentic OS' };

export default function TasksPage() {
  return <TasksApp />;
}
