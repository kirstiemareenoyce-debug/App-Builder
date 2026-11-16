export type KairosAIMode = "learning" | "reflection";
export type KairosAIInput = {
  query: string;
  mode: KairosAIMode;
  ai_use_consent: true;
  storage_consent: true;
};
export type KairosAIOutput = {
  interaction_id: string;
  response: string;
  mode: KairosAIMode;
  provider: string;
};
export type KairosAIInteraction = {
  id: string;
  user_id: string;
  query: string;
  response: string;
  mode: KairosAIMode;
  provider: string;
  created_at: string;
};

/** Local schema only: do not widen the application's shared Database definition. */
export type KairosAIDatabase = {
  public: {
    Tables: {
      kairos_ai_interactions: {
        Row: KairosAIInteraction & { ai_use_consent_version: string; storage_consent_version: string; consented_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
