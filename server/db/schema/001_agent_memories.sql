-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AgentForge Memory Engine
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  strength FLOAT DEFAULT 1.0 CHECK (strength BETWEEN 0.0 AND 1.0),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  decay_rate FLOAT DEFAULT 0.1,
  tags TEXT[]
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_memories_hnsw
  ON agent_memories USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent
  ON agent_memories (agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_memories_strength
  ON agent_memories (strength DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memories_created
  ON agent_memories (created_at DESC);

-- Vector search function
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_agent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  agent_id TEXT,
  content TEXT,
  similarity FLOAT,
  strength FLOAT,
  metadata JSONB,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.agent_id,
    m.content,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.strength,
    m.metadata,
    m.created_at
  FROM agent_memories m
  WHERE
    (filter_agent_id IS NULL OR m.agent_id = filter_agent_id)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
