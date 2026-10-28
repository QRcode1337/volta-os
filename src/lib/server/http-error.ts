import 'server-only';

/**
 * The one error type a VOLTA route turns into an HTTP response: `{ error: message, ...extra }` with `status`.
 * Message text must already be safe to show (no secrets). Domain errors that carry their own codes (LlmError,
 * TaskError, JevError, Honcho*, NotionError) stay as they are and are mapped to this at the route edge.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
