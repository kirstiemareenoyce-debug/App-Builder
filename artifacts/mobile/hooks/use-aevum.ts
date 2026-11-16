import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { getAevumErrorMessage } from "@/lib/aevum-errors";
import { AEVUM_STAGES } from "@/lib/aevum";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useAevumPreviewStore } from "@/store/use-aevum-preview-store";
import { queryKeys, type AevumConsentScope, type AevumProfile } from "@/types/app";

export function useAevumProfile() {
  const { user } = useKairosAuth();
  return useQuery({ queryKey: queryKeys.aevumProfile(user?.id ?? "anonymous"), enabled: Boolean(user), meta: { sensitive: true },
    queryFn: async (): Promise<AevumProfile | null> => {
      if (!user) return null;
      if (user.isPreview) return useAevumPreviewStore.getState().profile;
      const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
      const r = await client.from("aevum_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (r.error) throw new Error(getAevumErrorMessage(r.error)); return r.data as AevumProfile | null;
    } });
}
export function useAevumAnswer(stageKey: string) {
  const { user } = useKairosAuth();
  return useQuery({ queryKey: ["aevum-private-answer", user?.id ?? "anonymous", stageKey], enabled: Boolean(user), meta: { sensitive: true },
    queryFn: async (): Promise<string> => {
      if (!user) return "";
      if (user.isPreview) return useAevumPreviewStore.getState().answers[stageKey] ?? "";
      const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
      const r = await client.from("aevum_assessment_answers").select("answer").eq("user_id", user.id).eq("question_key", `${stageKey}_reflection`).maybeSingle();
      if (r.error) throw new Error(getAevumErrorMessage(r.error)); return typeof r.data?.answer === "string" ? r.data.answer : "";
    } });
}
export function useAevumConsents() {
  const { user } = useKairosAuth();
  return useQuery({ queryKey: queryKeys.aevumConsents(user?.id ?? "anonymous"), enabled: Boolean(user), meta: { sensitive: true },
    queryFn: async (): Promise<Partial<Record<AevumConsentScope, boolean>>> => {
      if (!user) return {};
      if (user.isPreview) return useAevumPreviewStore.getState().consents;
      const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
      const r = await client.from("aevum_consents").select("scope,granted").eq("user_id", user.id);
      if (r.error) throw new Error(getAevumErrorMessage(r.error));
      return Object.fromEntries(r.data.map((row) => [row.scope, row.granted]));
    } });
}
export function useSaveAevumConsent() {
  const { user } = useKairosAuth(); const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ scope, granted, version }: { scope: AevumConsentScope; granted: boolean; version: string }) => {
    if (!user) throw new Error("Sign in or open preview before recording consent.");
    if (user.isPreview) { useAevumPreviewStore.getState().setConsent(scope, granted); return null; }
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const now = new Date().toISOString();
    const r = await client.from("aevum_consents").upsert({ user_id: user.id, scope, version, granted, granted_at: granted ? now : null, revoked_at: granted ? null : now }, { onConflict: "user_id,scope" }).select("*").single();
    if (r.error) throw new Error(getAevumErrorMessage(r.error)); return r.data;
  }, onSuccess: async () => { if (user) { await qc.invalidateQueries({ queryKey: queryKeys.aevumConsents(user.id) }); await qc.invalidateQueries({ queryKey: ["aevum-relationship-shares", user.id] }); } } });
}
export function useSaveAevumStage() {
  const { user } = useKairosAuth(); const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ stageKey, questionKey, answer }: { stageKey: string; questionKey: string; answer: unknown }) => {
    if (!user) throw new Error("Sign in or open preview to save a private reflection.");
    if (!AEVUM_STAGES.some((s) => s.key === stageKey) || questionKey !== `${stageKey}_reflection` || typeof answer !== "string" || answer.trim().length < 2 || answer.trim().length > 2000) throw new Error("Use a valid stage and a reflection between 2 and 2,000 characters.");
    if (user.isPreview) {
      const s = useAevumPreviewStore.getState();
      if (!s.consents.assessment) throw new Error("Read and confirm assessment consent before saving your private reflection.");
      const now = new Date().toISOString();
      const stageStatus = { ...s.profile?.stage_status, [stageKey]: "completed" as const };
      const progress = AEVUM_STAGES.filter((stage) => stageStatus[stage.key] === "completed").length / AEVUM_STAGES.length;
      const profile: AevumProfile = { id: s.profile?.id ?? "preview-profile", user_id: user.id, completion_progress: progress, profile_status: progress >= 0.8 ? "ready" : "incomplete", stage_status: stageStatus, safety_flags: [], result_summary: {}, created_at: s.profile?.created_at ?? now, updated_at: now };
      s.setProfile(profile, stageKey, answer.trim()); return profile;
    }
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const r = await client.rpc("save_aevum_reflection", { p_stage_key: stageKey, p_answer: answer.trim() });
    if (r.error) throw new Error(getAevumErrorMessage(r.error)); return r.data;
  }, onSuccess: async () => { if (user) { await qc.invalidateQueries({ queryKey: queryKeys.aevumProfile(user.id) }); await qc.invalidateQueries({ queryKey: ["aevum-private-answer", user.id] }); } } });
}

export function useDeleteAevumReflections() {
  const { user } = useKairosAuth(); const qc = useQueryClient();
  return useMutation({ mutationFn: async () => {
    if (!user) throw new Error("Sign in before deleting private reflections.");
    if (user.isPreview) { useAevumPreviewStore.setState({ profile: null, answers: {} }); return; }
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const r = await client.from("aevum_profiles").delete().eq("user_id", user.id);
    if (r.error) throw new Error(getAevumErrorMessage(r.error));
  }, onSuccess: async () => { if (user) { await qc.invalidateQueries({ queryKey: queryKeys.aevumProfile(user.id) }); await qc.invalidateQueries({ queryKey: ["aevum-private-answer", user.id] }); } } });
}
