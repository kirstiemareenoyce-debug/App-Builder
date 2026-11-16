import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { requestAgentPlan, type AgentPlanRequest } from "@/lib/agent-plan-api";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import type { Tables, TablesInsert } from "@/types/database";
import type { AgentPlanStep } from "@/lib/agent-plan";

type AgentMemory = Tables<"agent_memories">;
type AgentPlan = Tables<"agent_plans">;
type AgentAuditEvent = Tables<"agent_audit_events">;
type MemoryCategory = AgentMemory["category"];

const agentKeys = {
  memories: (userId: string) => ["agent-memories", userId] as const,
  plans: (userId: string) => ["agent-plans", userId] as const,
  audit: (userId: string) => ["agent-audit", userId] as const,
};
const AUDIT_PAGE_SIZE = 50;
type AuditCursor = { createdAt: string; id: string };

function requireAgentCloud(user: ReturnType<typeof useKairosAuth>["user"]) {
  if (!user) throw new Error("Sign in to use your private Agent Desk.");
  if (user.isPreview) throw new Error("Sign in to save private memories, plans, and approval history.");
  const supabase = getOptionalSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured for private Agent Desk data.");
  return { supabase, user };
}

async function invalidateAgentData(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: agentKeys.memories(userId) }),
    queryClient.invalidateQueries({ queryKey: agentKeys.plans(userId) }),
    queryClient.invalidateQueries({ queryKey: agentKeys.audit(userId) }),
    queryClient.invalidateQueries({ queryKey: ["tasks", userId] }),
  ]);
}

export function useAgentMemories() {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: agentKeys.memories(user?.id ?? "anonymous"),
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    queryFn: async (): Promise<AgentMemory[]> => {
      const { supabase } = requireAgentCloud(user);
      const result = await supabase.from("agent_memories").select("*").order("updated_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useAgentPlans() {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: agentKeys.plans(user?.id ?? "anonymous"),
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    queryFn: async (): Promise<AgentPlan[]> => {
      const { supabase } = requireAgentCloud(user);
      const result = await supabase.from("agent_plans").select("*").order("created_at", { ascending: false }).limit(30);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useAgentAuditHistory() {
  const { user } = useKairosAuth();
  return useInfiniteQuery({
    queryKey: agentKeys.audit(user?.id ?? "anonymous"),
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    initialPageParam: null as AuditCursor | null,
    queryFn: async ({ pageParam }): Promise<AgentAuditEvent[]> => {
      const { supabase } = requireAgentCloud(user);
      let query = supabase.from("agent_audit_events").select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      const cursor = pageParam as AuditCursor | null;
      if (cursor) {
        query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      }
      const result = await query.limit(AUDIT_PAGE_SIZE);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage.at(-1);
      return lastPage.length === AUDIT_PAGE_SIZE && last
        ? { createdAt: last.created_at, id: last.id }
        : undefined;
    },
  });
}

export function useSaveAgentMemory() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; content: string; category: MemoryCategory }) => {
      const { supabase, user: owner } = requireAgentCloud(user);
      const clean = { title: input.title.trim(), content: input.content.trim(), category: input.category };
      if (clean.title.length < 1 || clean.title.length > 80) throw new Error("Memory title must be 1–80 characters.");
      if (clean.content.length < 1 || clean.content.length > 2000) throw new Error("Memory text must be 1–2,000 characters.");
      if (input.id) {
        const result = await supabase.from("agent_memories").update(clean).eq("id", input.id).eq("user_id", owner.id).select("*").single();
        if (result.error) throw result.error;
        return result.data;
      }
      const result = await supabase.from("agent_memories").insert({ ...clean, user_id: owner.id }).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => user && invalidateAgentData(queryClient, user.id),
  });
}

export function useDeleteAgentMemory() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { supabase, user: owner } = requireAgentCloud(user);
      const result = await supabase.from("agent_memories").delete().eq("id", id).eq("user_id", owner.id);
      if (result.error) throw result.error;
      return id;
    },
    onSuccess: () => user && invalidateAgentData(queryClient, user.id),
  });
}

export function useSaveAgentPlan() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { goal: string; source_file_name: string | null; steps: AgentPlanStep[] }) => {
      const { supabase, user: owner } = requireAgentCloud(user);
      const goal = input.goal.trim();
      if (goal.length < 3 || goal.length > 2000) throw new Error("Plan goal must be 3–2,000 characters.");
      if (input.steps.length < 1 || input.steps.length > 8) throw new Error("A plan needs 1–8 reviewable steps.");
      const insert: TablesInsert<"agent_plans"> = {
        user_id: owner.id,
        goal,
        source_file_name: input.source_file_name,
        steps: input.steps,
      };
      const result = await supabase.from("agent_plans").insert(insert).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => user && invalidateAgentData(queryClient, user.id),
  });
}

export function useDraftAgentPlan() {
  const { user } = useKairosAuth();
  return useMutation({
    mutationFn: async (input: AgentPlanRequest) => {
      requireAgentCloud(user);
      if (input.memories.length > 3) throw new Error("Choose up to three memories for one request.");
      return requestAgentPlan(input);
    },
  });
}

export function useApproveAgentPlan() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: AgentPlan) => {
      const { supabase } = requireAgentCloud(user);
      const result = await supabase.rpc("approve_agent_plan", {
        p_plan_id: plan.id,
        p_expected_updated_at: plan.updated_at,
        p_expected_steps: plan.steps,
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => user && invalidateAgentData(queryClient, user.id),
  });
}

export type { AgentAuditEvent, AgentMemory, AgentPlan };
