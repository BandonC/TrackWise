export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      application_events: {
        Row: {
          application_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          to_status: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          to_status?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          to_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_time_to_response"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          cluster_id: string | null
          company: string
          embedding: string | null
          embedding_source: string | null
          id: string
          job_description: string | null
          last_updated_at: string
          location: string | null
          notes: string | null
          resume_fit_computed_at: string | null
          resume_fit_reasoning: string | null
          resume_fit_section_label: string | null
          resume_fit_similarity: number | null
          role: string
          salary_max: number | null
          salary_min: number | null
          source_site: string | null
          source_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          cluster_id?: string | null
          company: string
          embedding?: string | null
          embedding_source?: string | null
          id?: string
          job_description?: string | null
          last_updated_at?: string
          location?: string | null
          notes?: string | null
          resume_fit_computed_at?: string | null
          resume_fit_reasoning?: string | null
          resume_fit_section_label?: string | null
          resume_fit_similarity?: number | null
          role: string
          salary_max?: number | null
          salary_min?: number | null
          source_site?: string | null
          source_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          applied_at?: string
          cluster_id?: string | null
          company?: string
          embedding?: string | null
          embedding_source?: string | null
          id?: string
          job_description?: string | null
          last_updated_at?: string
          location?: string | null
          notes?: string | null
          resume_fit_computed_at?: string | null
          resume_fit_reasoning?: string | null
          resume_fit_section_label?: string | null
          resume_fit_similarity?: number | null
          role?: string
          salary_max?: number | null
          salary_min?: number | null
          source_site?: string | null
          source_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_response_rate_by_cluster"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      clusters: {
        Row: {
          computed_at: string
          id: string
          label: string
          size: number
          user_id: string
        }
        Insert: {
          computed_at?: string
          id?: string
          label: string
          size: number
          user_id: string
        }
        Update: {
          computed_at?: string
          id?: string
          label?: string
          size?: number
          user_id?: string
        }
        Relationships: []
      }
      fit_score_call_log: {
        Row: {
          called_at: string
          user_id: string
        }
        Insert: {
          called_at?: string
          user_id: string
        }
        Update: {
          called_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_chunks: {
        Row: {
          created_at: string
          embedding: string | null
          embedding_source: string | null
          id: string
          ordinal: number
          resume_id: string
          section_label: string
          section_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          embedding_source?: string | null
          id?: string
          ordinal: number
          resume_id: string
          section_label: string
          section_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          embedding_source?: string | null
          id?: string
          ordinal?: number
          resume_id?: string
          section_label?: string
          section_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_chunks_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          content: string
          created_at: string
          embedding_source: string | null
          id: string
          is_active: boolean
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding_source?: string | null
          id?: string
          is_active?: boolean
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding_source?: string | null
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_response_by_source: {
        Row: {
          applied_at: string | null
          source_site: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          source_site?: never
          status?: string | null
          user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          source_site?: never
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_response_rate: {
        Row: {
          applied_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_response_rate_by_cluster: {
        Row: {
          cluster_id: string | null
          computed_at: string | null
          label: string | null
          rate: number | null
          responded: number | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_time_to_response: {
        Row: {
          applied_at: string | null
          days_to_response: number | null
          first_response_at: string | null
          id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_fit_score_rate_limit: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      find_similar_applications: {
        Args: { match_count?: number; target_id: string }
        Returns: {
          company: string
          id: string
          role: string
          similarity: number
        }[]
      }
      ping: { Args: never; Returns: string }
      resume_fit_for_application: {
        Args: { application_id: string; top_k?: number }
        Returns: {
          chunk_id: string
          resume_id: string
          resume_label: string
          section_label: string
          section_ordinal: number
          section_text: string
          similarity: number
        }[]
      }
      score_external_job_history: {
        Args: { p_query: string; p_user_id: string }
        Returns: {
          application_id: string
          company: string
          role: string
          similarity: number
        }[]
      }
      score_external_job_resume: {
        Args: { p_query: string; p_top_k?: number; p_user_id: string }
        Returns: {
          resume_label: string
          section_label: string
          section_text: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
