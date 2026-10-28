import 'server-only';
// VOLTA's LLM helper: route a task through the OmniRoute gateway (config/llm-routes.json), local LM Studio last.
//   import { complete } from '@/lib/server/llm';
//   const r = await complete({ task: 'quick', messages: [{ role: 'user', content: '…' }] });
export { complete, completeStream, llmHttp, TaskError, validateMessages } from './router';
export { chat, chatStream } from './client';
export { loadRoutes, chainFor, CONFIG_PATH, LOCAL_TARGET } from './config';
export { recentUsage, USAGE_LOG_PATH } from './usage-log';
export * from './types';
