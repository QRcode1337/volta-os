/**
 * Common document shape produced by all memory adapters.
 * The embedder consumes these and upserts into agent_memories.
 */
export interface MemoryDocument {
  /** Raw text content (truncated to maxContentLength by the adapter) */
  content: string
  /** Human-readable title extracted from the content */
  title: string
  /** Adapter source identifier, e.g. 'scout', 'claude-code', 'openclaw' */
  source: string
  /** Original file path (relative to adapter root) */
  filePath?: string
  /** ISO date string (extracted from filename or stat) */
  date?: string
  /** Arbitrary metadata stored alongside the embedding */
  metadata: Record<string, any>
  /** Searchable tags */
  tags: string[]
}

/**
 * Interface all memory adapters must implement.
 * Each adapter knows how to read one data source (filesystem, Claude Code, OpenClaw, etc.)
 */
export interface MemoryAdapter {
  /** Unique adapter name */
  name: string

  /** Check if this adapter's data source is reachable */
  isAvailable(): boolean

  /** Scan for new or changed documents since the given date */
  getNewDocuments(since?: Date): Promise<MemoryDocument[]>

  /** Retrieve a single document by path or ID */
  getDocument(id: string): Promise<MemoryDocument | null>
}
