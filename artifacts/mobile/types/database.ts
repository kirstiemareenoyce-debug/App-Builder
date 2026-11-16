export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          timezone: string;
          date_format: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
          language: string;
          theme: "light" | "dark" | "system";
          ai_personality: string;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          date_format?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
          language?: string;
          theme?: "light" | "dark" | "system";
          ai_personality?: string;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: Relationship[];
      };
      interactions: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          response: string;
          confidence: number;
          context_used: Json;
          flagged_for_review: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          query: string;
          response: string;
          confidence: number;
          context_used?: Json;
          flagged_for_review?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interactions"]["Insert"]>;
        Relationships: Relationship[];
      };
      feedback: {
        Row: {
          id: string;
          interaction_id: string;
          user_id: string;
          rating: -1 | 0 | 1;
          correction: string | null;
          category:
            | "general"
            | "emotional_support"
            | "practical_advice"
            | "information"
            | "personalisation"
            | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          interaction_id: string;
          user_id: string;
          rating: -1 | 0 | 1;
          correction?: string | null;
          category?: Database["public"]["Tables"]["feedback"]["Row"]["category"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["feedback"]["Insert"]>;
        Relationships: Relationship[];
      };
      embeddings: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          embedding: string;
          metadata: Json;
          source_type:
            | "interaction"
            | "mood"
            | "sleep"
            | "task"
            | "note"
            | "feedback"
            | "life_event";
          source_id: string | null;
          weight: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          embedding: string | number[];
          metadata?: Json;
          source_type: Database["public"]["Tables"]["embeddings"]["Row"]["source_type"];
          source_id?: string | null;
          weight?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["embeddings"]["Insert"]>;
        Relationships: Relationship[];
      };
      metrics_snapshots: {
        Row: {
          id: string;
          user_id: string;
          accuracy: number;
          personalisation: number;
          hallucination_rate: number;
          satisfaction: number;
          interaction_count: number;
          feedback_count: number;
          period_start: string;
          period_end: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          accuracy?: number;
          personalisation?: number;
          hallucination_rate?: number;
          satisfaction?: number;
          interaction_count?: number;
          feedback_count?: number;
          period_start: string;
          period_end: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["metrics_snapshots"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      moods: {
        Row: {
          id: string;
          user_id: string;
          score: number;
          energy_level: number | null;
          notes: string | null;
          logged_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          score: number;
          energy_level?: number | null;
          notes?: string | null;
          logged_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["moods"]["Insert"]>;
        Relationships: Relationship[];
      };
      sleep_logs: {
        Row: {
          id: string;
          user_id: string;
          duration_minutes: number;
          quality: number;
          bedtime: string;
          wake_time: string;
          notes: string | null;
          logged_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          duration_minutes: number;
          quality: number;
          bedtime: string;
          wake_time: string;
          notes?: string | null;
          logged_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sleep_logs"]["Insert"]>;
        Relationships: Relationship[];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          priority: "low" | "medium" | "high" | "urgent";
          status: "todo" | "in_progress" | "done" | "cancelled";
          due_date: string | null;
          project_id: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          priority?: "low" | "medium" | "high" | "urgent";
          status?: "todo" | "in_progress" | "done" | "cancelled";
          due_date?: string | null;
          project_id?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: Relationship[];
      };
      work_expenses: {
        Row: {
          id: string;
          user_id: string;
          merchant: string;
          amount: number;
          currency: string;
          expense_date: string;
          notes: string;
          attachment_path: string | null;
          attachment_mime_type: string | null;
          attachment_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          merchant: string;
          amount: number;
          currency?: string;
          expense_date: string;
          notes?: string;
          attachment_path?: string | null;
          attachment_mime_type?: string | null;
          attachment_bytes?: number | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["work_expenses"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      source_ai_consents: {
        Row: {
          user_id: string;
          scope: "search" | "brief";
          version: string;
          granted: boolean;
          granted_at: string | null;
          revoked_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          scope: "search" | "brief";
          version: string;
          granted?: boolean;
          granted_at?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["source_ai_consents"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      source_brief_tasks: {
        Row: {
          id: string;
          user_id: string;
          scope: "evergreen" | "aevum";
          goal: string;
          selected_sources: Json;
          status:
            | "pending"
            | "retrieving"
            | "generating"
            | "completed"
            | "failed";
          markdown_content: string | null;
          brief_consent_granted_at: string;
          coaching_consent_granted_at: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: Relationship[];
      };
      agent_memories: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          category: "personal" | "work" | "relationship" | "general";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          category?: "personal" | "work" | "relationship" | "general";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["agent_memories"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      agent_plans: {
        Row: {
          id: string;
          user_id: string;
          goal: string;
          source_file_name: string | null;
          steps: Json;
          status: "draft" | "approved";
          task_ids: string[];
          created_at: string;
          updated_at: string;
          approved_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal: string;
          source_file_name?: string | null;
          steps: Json;
          status?: "draft" | "approved";
          task_ids?: string[];
          created_at?: string;
          updated_at?: string;
          approved_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["agent_plans"]["Insert"]>;
        Relationships: Relationship[];
      };
      agent_audit_events: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          object_type: string;
          object_id: string;
          summary: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          object_type: string;
          object_id: string;
          summary: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["agent_audit_events"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string | null;
          tags: string[];
          search_vector: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: Relationship[];
      };
      aevum_relationship_entries: {
        Row: import("@/lib/relationship-hub").RelationshipEntry;
        Insert: {
          id?: string;
          user_id: string;
          category: import("@/lib/relationship-hub").RelationshipCategory;
          title: string;
          body: string;
          detail_url?: string | null;
          event_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_relationship_entries"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_relationship_shares: {
        Row: import("@/lib/relationship-hub").RelationshipShare;
        Insert: never;
        Update: never;
        Relationships: Relationship[];
      };
      relationship_media_items: {
        Row: import("@/lib/relationship-media").RelationshipMediaItem;
        Insert: {
          id?: string;
          user_id: string;
          kind: import("@/lib/relationship-media").RelationshipMediaKind;
          provider: import("@/lib/relationship-media").RelationshipMediaProvider;
          title: string;
          note?: string;
          external_url?: string | null;
          object_path?: string | null;
          mime_type?: string | null;
          byte_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["relationship_media_items"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      relationship_media_shares: {
        Row: import("@/lib/relationship-media").RelationshipMediaShare;
        Insert: never;
        Update: never;
        Relationships: Relationship[];
      };
      partner_connections: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string;
          status: "pending" | "accepted" | "rejected" | "disconnected";
          shared_categories: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          recipient_id: string;
          status?: "pending" | "accepted" | "rejected" | "disconnected";
          shared_categories?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["partner_connections"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_profiles: {
        Row: {
          id: string;
          user_id: string;
          completion_progress: number;
          profile_status: "incomplete" | "ready" | "paused";
          stage_status: Json;
          safety_flags: string[];
          result_summary: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          completion_progress?: number;
          profile_status?: "incomplete" | "ready" | "paused";
          stage_status?: Json;
          safety_flags?: string[];
          result_summary?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_profiles"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_assessment_sessions: {
        Row: {
          id: string;
          profile_id: string;
          user_id: string;
          stage_key: string;
          status: "not_started" | "in_progress" | "completed" | "needs_review";
          started_at: string | null;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          user_id: string;
          stage_key: string;
          status?: "not_started" | "in_progress" | "completed" | "needs_review";
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_assessment_sessions"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_assessment_answers: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          question_key: string;
          answer: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          question_key: string;
          answer: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_assessment_answers"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_consents: {
        Row: {
          id: string;
          user_id: string;
          scope:
            | "assessment"
            | "individual_profile"
            | "partner_sharing"
            | "couple_map"
            | "coaching";
          version: string;
          granted: boolean;
          granted_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          scope: Database["public"]["Tables"]["aevum_consents"]["Row"]["scope"];
          version: string;
          granted?: boolean;
          granted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_consents"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_sharing_grants: {
        Row: {
          id: string;
          connection_id: string;
          owner_id: string;
          partner_id: string;
          category:
            | "attachment_triggers"
            | "conflict_patterns"
            | "communication_preferences"
            | "baseline_signals"
            | "goals";
          granted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          connection_id: string;
          owner_id: string;
          partner_id: string;
          category: Database["public"]["Tables"]["aevum_sharing_grants"]["Row"]["category"];
          granted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_sharing_grants"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_couple_maps: {
        Row: {
          id: string;
          connection_id: string;
          requester_id: string;
          recipient_id: string;
          map_summary: Json;
          risk_level: "not_available" | "lower" | "elevated" | "higher" | null;
          generated_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          connection_id: string;
          requester_id: string;
          recipient_id: string;
          map_summary?: Json;
          risk_level?: "not_available" | "lower" | "elevated" | "higher" | null;
          generated_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_couple_maps"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      aevum_coaching_sessions: {
        Row: {
          id: string;
          user_id: string;
          connection_id: string | null;
          mode:
            | "individual_reflection"
            | "conflict_navigator"
            | "couple_coaching"
            | "trauma_informed";
          prompt: string;
          response: string;
          context_summary: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          connection_id?: string | null;
          mode: Database["public"]["Tables"]["aevum_coaching_sessions"]["Row"]["mode"];
          prompt: string;
          response: string;
          context_summary?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["aevum_coaching_sessions"]["Insert"]
        >;
        Relationships: Relationship[];
      };
      app_settings: {
        Row: {
          id: string;
          user_id: string;
          notifications_enabled: Json;
          privacy_level: "strict" | "standard" | "open";
          data_retention_months: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          notifications_enabled?: Json;
          privacy_level?: "strict" | "standard" | "open";
          data_retention_months?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
        Relationships: Relationship[];
      };
      expo_push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: "ios" | "android";
          enabled: boolean;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform: "ios" | "android";
          enabled?: boolean;
          last_seen_at?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["expo_push_tokens"]["Insert"]
        >;
        Relationships: Relationship[];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_aevum_reflection: {
        Args: { p_stage_key: string; p_answer: string };
        Returns: Database["public"]["Tables"]["aevum_profiles"]["Row"];
      };
      share_aevum_entry: {
        Args: {
          p_entry_id: string;
          p_connection_id: string;
          p_expected_updated_at: string;
        };
        Returns: Database["public"]["Tables"]["aevum_relationship_shares"]["Row"];
      };
      revoke_aevum_entry: {
        Args: { p_entry_id: string };
        Returns: number;
      };
      share_relationship_media: {
        Args: {
          p_item_id: string;
          p_connection_id: string;
          p_expected_updated_at: string;
        };
        Returns: Database["public"]["Tables"]["relationship_media_shares"]["Row"];
      };
      revoke_relationship_media: {
        Args: { p_item_id: string };
        Returns: number;
      };
      set_aevum_partner_connection: {
        Args: { p_connection_id: string; p_status: string };
        Returns: Database["public"]["Tables"]["partner_connections"]["Row"];
      };
      match_embeddings: {
        Args: {
          query_embedding: string | number[];
          match_threshold?: number;
          match_count?: number;
          p_user_id?: string;
        };
        Returns: {
          id: string;
          content: string;
          source_type: string;
          metadata: Json;
          similarity: number;
          weight: number;
        }[];
      };
      search_notes: {
        Args: { p_search_query: string; p_limit?: number };
        Returns: {
          id: string;
          title: string;
          content: string | null;
          tags: string[];
          rank: number;
          updated_at: string;
        }[];
      };
      store_evergreen_interaction: {
        Args: {
          p_user_id: string;
          p_query: string;
          p_response: string;
          p_confidence: number;
          p_context_used: Json;
          p_flagged_for_review: boolean;
          p_embedding_content: string;
          p_embedding: string | number[];
          p_metadata: Json;
        };
        Returns: string;
      };
      apply_evergreen_feedback: {
        Args: {
          p_user_id: string;
          p_interaction_id: string;
          p_rating: number;
          p_correction?: string | null;
          p_category?: string | null;
          p_correction_embedding?: string | number[] | null;
        };
        Returns: { feedback_id: string; learning_impact: string }[];
      };
      create_weekly_metrics_snapshot: {
        Args: {
          p_user_id: string;
          p_period_start?: string;
          p_period_end?: string;
        };
        Returns: Database["public"]["Tables"]["metrics_snapshots"]["Row"];
      };
      run_weekly_maintenance: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      invoke_weekly_maintenance_edge_function: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      approve_agent_plan: {
        Args: {
          p_plan_id: string;
          p_expected_updated_at: string;
          p_expected_steps: Json;
        };
        Returns: string[];
      };
      consume_agent_plan_quota: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
