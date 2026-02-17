-- Swarms (not in AgentForge yet)
CREATE TABLE IF NOT EXISTS public.swarms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  strategy TEXT CHECK (strategy IN ('hierarchical', 'mesh', 'adaptive')),
  topology JSONB NOT NULL,
  status TEXT CHECK (status IN ('idle', 'active', 'paused', 'completed')) DEFAULT 'idle',
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.swarm_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID REFERENCES swarms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT CHECK (status IN ('idle', 'working', 'blocked', 'completed')) DEFAULT 'idle',
  current_task JSONB,
  performance JSONB DEFAULT '{}'
);

-- CASCADE Business Automation
CREATE TABLE IF NOT EXISTS public.cascade_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  name TEXT,
  source TEXT CHECK (source IN ('missed_call', 'web_form', 'referral')),
  status TEXT CHECK (status IN ('new', 'contacted', 'qualified', 'booking', 'booked', 'completed', 'lost')) DEFAULT 'new',
  conversation_history JSONB DEFAULT '[]',
  memory_id UUID REFERENCES agent_memories(id) ON DELETE SET NULL,
  assigned_swarm_id UUID REFERENCES swarms(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_contact TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.cascade_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES cascade_leads(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  status TEXT CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')) DEFAULT 'pending',
  confirmation_sent BOOLEAN DEFAULT FALSE,
  reminders_sent INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.cascade_nurture_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES cascade_leads(id) ON DELETE CASCADE,
  sequence_type TEXT CHECK (sequence_type IN ('booking_reminder', 'follow_up', 'reengagement')),
  channel TEXT CHECK (channel IN ('sms', 'email', 'voice')),
  step INTEGER NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms (status);
CREATE INDEX IF NOT EXISTS idx_swarm_agents_swarm ON swarm_agents (swarm_id);
CREATE INDEX IF NOT EXISTS idx_cascade_leads_phone ON cascade_leads (phone);
CREATE INDEX IF NOT EXISTS idx_cascade_leads_status ON cascade_leads (status);
CREATE INDEX IF NOT EXISTS idx_cascade_leads_swarm ON cascade_leads (assigned_swarm_id);
CREATE INDEX IF NOT EXISTS idx_cascade_bookings_lead ON cascade_bookings (lead_id);
CREATE INDEX IF NOT EXISTS idx_cascade_bookings_date ON cascade_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cascade_nurture_lead ON cascade_nurture_sequences (lead_id);
CREATE INDEX IF NOT EXISTS idx_cascade_nurture_scheduled ON cascade_nurture_sequences (scheduled_time);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER swarms_updated_at
  BEFORE UPDATE ON swarms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cascade_leads_updated_at
  BEFORE UPDATE ON cascade_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
