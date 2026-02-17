export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      agent_memories: {
        Row: {
          id: string
          agent_id: string
          content: string
          embedding: number[] | null
          strength: number
          metadata: Json
          created_at: string
          last_accessed: string
          decay_rate: number
          tags: string[] | null
        }
        Insert: {
          id?: string
          agent_id: string
          content: string
          embedding?: number[] | null
          strength?: number
          metadata?: Json
          created_at?: string
          last_accessed?: string
          decay_rate?: number
          tags?: string[] | null
        }
        Update: {
          id?: string
          agent_id?: string
          content?: string
          embedding?: number[] | null
          strength?: number
          metadata?: Json
          created_at?: string
          last_accessed?: string
          decay_rate?: number
          tags?: string[] | null
        }
      }
      cascade_leads: {
        Row: {
          id: string
          phone: string
          name: string | null
          source: string
          status: string
          conversation_history: Json
          memory_id: string | null
          assigned_swarm_id: string | null
          created_at: string
          updated_at: string
          last_contact: string | null
        }
        Insert: {
          id?: string
          phone: string
          name?: string | null
          source: string
          status?: string
          conversation_history?: Json
          memory_id?: string | null
          assigned_swarm_id?: string | null
        }
        Update: {
          phone?: string
          name?: string | null
          source?: string
          status?: string
          conversation_history?: Json
          memory_id?: string | null
          assigned_swarm_id?: string | null
          last_contact?: string | null
        }
      }
      cascade_bookings: {
        Row: {
          id: string
          lead_id: string
          service_type: string
          scheduled_date: string
          status: string
          confirmation_sent: boolean
          reminders_sent: number
          metadata: Json
        }
        Insert: {
          id?: string
          lead_id: string
          service_type: string
          scheduled_date: string
          status?: string
          confirmation_sent?: boolean
          reminders_sent?: number
          metadata?: Json
        }
        Update: {
          service_type?: string
          scheduled_date?: string
          status?: string
          confirmation_sent?: boolean
          reminders_sent?: number
          metadata?: Json
        }
      }
      cascade_nurture_sequences: {
        Row: {
          id: string
          lead_id: string
          sequence_type: string
          channel: string
          step: number
          scheduled_time: string
          sent: boolean
          response: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          sequence_type: string
          channel: string
          step: number
          scheduled_time: string
          sent?: boolean
          response?: Json | null
        }
        Update: {
          sequence_type?: string
          channel?: string
          step?: number
          scheduled_time?: string
          sent?: boolean
          response?: Json | null
        }
      }
      swarms: {
        Row: {
          id: string
          name: string
          strategy: string | null
          topology: Json
          status: string
          performance_metrics: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          strategy?: string | null
          topology: Json
          status?: string
          performance_metrics?: Json
        }
        Update: {
          name?: string
          strategy?: string | null
          topology?: Json
          status?: string
          performance_metrics?: Json
        }
      }
      swarm_agents: {
        Row: {
          id: string
          swarm_id: string
          agent_id: string
          role: string
          status: string
          current_task: Json | null
          performance: Json
        }
        Insert: {
          id?: string
          swarm_id: string
          agent_id: string
          role: string
          status?: string
          current_task?: Json | null
          performance?: Json
        }
        Update: {
          role?: string
          status?: string
          current_task?: Json | null
          performance?: Json
        }
      }
    }
    Functions: {
      search_memories: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
          filter_agent_id?: string
        }
        Returns: {
          id: string
          agent_id: string
          content: string
          similarity: number
          strength: number
          metadata: Json
          created_at: string
        }[]
      }
    }
  }
}
