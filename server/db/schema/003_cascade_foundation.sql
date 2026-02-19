-- Foundation safety fixes and atomic CASCADE helpers

-- Ensure update trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove legacy/invalid FK if it exists (older schema referenced non-existent agents table)
ALTER TABLE IF EXISTS public.swarm_agents
  DROP CONSTRAINT IF EXISTS swarm_agents_agent_id_fkey;

-- Ensure cascade_leads.memory_id always points to agent_memories(id)
ALTER TABLE IF EXISTS public.cascade_leads
  DROP CONSTRAINT IF EXISTS cascade_leads_memory_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cascade_leads_memory_id_fkey'
  ) THEN
    ALTER TABLE public.cascade_leads
      ADD CONSTRAINT cascade_leads_memory_id_fkey
      FOREIGN KEY (memory_id)
      REFERENCES public.agent_memories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Atomic JSONB append to prevent lost conversation updates
CREATE OR REPLACE FUNCTION append_cascade_conversation_message(
  p_lead_id UUID,
  p_message JSONB
)
RETURNS public.cascade_leads
LANGUAGE plpgsql
AS $$
DECLARE
  updated_lead public.cascade_leads;
BEGIN
  UPDATE public.cascade_leads
  SET
    conversation_history = COALESCE(conversation_history, '[]'::JSONB) || jsonb_build_array(p_message),
    last_contact = NOW()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  RETURN updated_lead;
END;
$$;

-- Atomic memory reinforcement to prevent read-modify-write races
CREATE OR REPLACE FUNCTION reinforce_agent_memory(
  p_memory_id UUID,
  p_strength_delta DOUBLE PRECISION
)
RETURNS public.agent_memories
LANGUAGE plpgsql
AS $$
DECLARE
  updated_memory public.agent_memories;
BEGIN
  UPDATE public.agent_memories
  SET
    strength = LEAST(1.0, strength + p_strength_delta),
    last_accessed = NOW()
  WHERE id = p_memory_id
  RETURNING * INTO updated_memory;

  RETURN updated_memory;
END;
$$;

-- Idempotent sent marker to avoid duplicate sends with overlapping loops
CREATE OR REPLACE FUNCTION mark_nurture_message_sent_if_pending(
  p_message_id UUID,
  p_response JSONB DEFAULT NULL
)
RETURNS public.cascade_nurture_sequences
LANGUAGE plpgsql
AS $$
DECLARE
  updated_message public.cascade_nurture_sequences;
BEGIN
  UPDATE public.cascade_nurture_sequences
  SET
    sent = TRUE,
    response = p_response
  WHERE id = p_message_id
    AND sent = FALSE
  RETURNING * INTO updated_message;

  RETURN updated_message;
END;
$$;
