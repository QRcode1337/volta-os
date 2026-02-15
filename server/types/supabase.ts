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
      memories: {
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
          last_accessed: string
          tags: string[] | null
        }[]
      }
    }
  }
}
