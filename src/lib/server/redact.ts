import 'server-only';

// One secret masker for everything that shows text a secret may have been captured in (chats, OCR of the
// screen, notes): the Honcho proxy, VOLTA Search and the LTM viewer. The rules live in search/redact.ts
// (dependency-free so redact.test.ts can run under plain Node); import from here in server code.
export { MASK, maskToken, redact as redactSecrets } from './search/redact';
