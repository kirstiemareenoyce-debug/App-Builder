import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { KairosBadge } from "@/components/kairos/badge";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosChip } from "@/components/kairos/chip";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { SourceDiscoverySection } from "@/components/kairos/source-discovery-section";
import { ScreenContainer } from "@/components/screen-container";
import { useAgentAuditHistory, useAgentMemories, useAgentPlans, useApproveAgentPlan, useDeleteAgentMemory, useDraftAgentPlan, useSaveAgentMemory, useSaveAgentPlan, type AgentMemory, type AgentPlan } from "@/hooks/use-agent-desk";
import { useColors } from "@/hooks/use-colors";
import { extractAgentFileInput, MAX_FILE_BYTES } from "@/lib/agent-file-input";
import { parseAgentPlanSteps, type AgentPlanStep } from "@/lib/agent-plan";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

type DeskSection = "plan" | "sources" | "memory" | "history";
type MemoryCategory = AgentMemory["category"];
const SECTIONS: { id: DeskSection; label: string }[] = [
  { id: "plan", label: "Plan & review" },
  { id: "sources", label: "Research & briefs" },
  { id: "memory", label: "My memory" },
  { id: "history", label: "Activity" },
];
const MEMORY_CATEGORIES: { value: MemoryCategory; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "relationship", label: "Relationship" },
  { value: "general", label: "General" },
];

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function decodeBase64(base64: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/\s/g, "").replace(/=+$/, "");
  if (clean.length % 4 === 1) throw new Error("The selected file could not be decoded.");
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let accumulator = 0;
  let bitCount = 0;
  let offset = 0;
  for (const character of clean) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("The selected file could not be decoded.");
    accumulator = (accumulator << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[offset++] = (accumulator >> bitCount) & 0xff;
      accumulator &= (1 << bitCount) - 1;
    }
  }
  return bytes.subarray(0, offset);
}

function getPlanSteps(plan: AgentPlan): AgentPlanStep[] {
  if (!Array.isArray(plan.steps)) return [];
  return plan.steps.filter((step): step is AgentPlanStep => {
    if (!step || typeof step !== "object" || Array.isArray(step)) return false;
    const item = step as Record<string, unknown>;
    return typeof item.title === "string" && typeof item.description === "string" &&
      (item.priority === "low" || item.priority === "medium" || item.priority === "high");
  });
}

function actionLabel(action: string) {
  if (action === "insert") return "Created";
  if (action === "update") return "Edited";
  if (action === "delete") return "Deleted";
  if (action === "plan_approved") return "Approved";
  return action.replaceAll("_", " ");
}

function showConfirm(title: string, message: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: destructive ? "Delete" : "Continue", style: destructive ? "destructive" : "default", onPress: onConfirm },
    ]);
  }
}

export default function AgentDeskScreen() {
  const colors = useColors();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const [section, setSection] = useState<DeskSection>("plan");
  const [goal, setGoal] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState("");
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [aiAcknowledged, setAiAcknowledged] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<AgentPlanStep[]>([]);
  const [memoryId, setMemoryId] = useState<string | undefined>();
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("general");
  const [saveError, setSaveError] = useState<string | null>(null);

  const memories = useAgentMemories();
  const plans = useAgentPlans();
  const history = useAgentAuditHistory();
  const draftPlanMutation = useDraftAgentPlan();
  const saveMemory = useSaveAgentMemory();
  const deleteMemory = useDeleteAgentMemory();
  const savePlan = useSaveAgentPlan();
  const approvePlan = useApproveAgentPlan();

  const selectedMemories = useMemo(
    () => (memories.data ?? []).filter((item) => selectedMemoryIds.includes(item.id)),
    [memories.data, selectedMemoryIds],
  );
  const historyEvents = history.data?.pages.flatMap((page) => page) ?? [];
  const canUseCloud = Boolean(user && !user.isPreview);

  const pickTextFile = async () => {
    setSaveError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/markdown", "text/csv", "application/json", "text/html", "application/xml"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const localInfo = Platform.OS === "web" ? null : await FileSystem.getInfoAsync(asset.uri);
      const knownSize = asset.size ?? asset.file?.size ?? (localInfo && localInfo.exists ? localInfo.size : undefined);
      if (knownSize !== undefined && knownSize > MAX_FILE_BYTES) {
        throw new Error("Choose a file no larger than 200 KiB.");
      }
      const bytes = Platform.OS === "web"
        ? new Uint8Array(await (await fetch(asset.uri)).arrayBuffer())
        : decodeBase64(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const extracted = extractAgentFileInput(asset.name, bytes);
      if (!extracted.ok) throw new Error(extracted.error);
      if (!extracted.text.trim()) {
        throw new Error("That file does not contain readable text.");
      }
      setFileName(extracted.metadata.filename.slice(0, 255));
      setFileText(extracted.text);
      setAiAcknowledged(false);
      showToast(extracted.metadata.truncated ? "File text ready; only the first 12,000 characters will be sent." : "File text ready. It stays local until you request a plan.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The text file could not be read.";
      setSaveError(message);
      showToast(message, "error");
    }
  };

  const draftPlan = async () => {
    setSaveError(null);
    if (!canUseCloud) {
      setSaveError("Sign in with a connected account to use the Agent Desk planning service and save plans.");
      return;
    }
    if (goal.trim().length < 3) {
      setSaveError("Enter a goal of at least 3 characters.");
      return;
    }
    if (!aiAcknowledged) {
      setSaveError("Review and acknowledge the AI data-use note before continuing.");
      return;
    }
    const memoryBytes = selectedMemories.reduce(
      (total, memory) => total + utf8ByteLength(memory.title) + utf8ByteLength(memory.content),
      0,
    );
    if (memoryBytes > 12000) {
      setSaveError("The selected memories are too large for one request. Remove one or choose shorter memories.");
      return;
    }
    try {
      const response = await draftPlanMutation.mutateAsync({
        goal: goal.trim(),
        file_name: fileName,
        file_text: fileText,
        memories: selectedMemories.map(({ title, content }) => ({ title, content })),
      });
      const steps = parseAgentPlanSteps(response.response);
      if (!steps.length) throw new Error("Evergreen returned a plan format I could not safely read. Try asking for short task lines and draft again.");
      setGeneratedSteps(steps);
      showToast(`Draft received from ${response.provider}. Review and edit every step before saving or approving it.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Agent Desk service could not draft a plan.";
      setSaveError(message);
      showToast(message, "error");
    }
  };

  const updateGeneratedStep = (index: number, updates: Partial<AgentPlanStep>) => {
    setGeneratedSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...updates } : step));
  };

  const saveDraftPlan = async () => {
    setSaveError(null);
    try {
      const result = await savePlan.mutateAsync({ goal, source_file_name: fileName, steps: generatedSteps });
      setGeneratedSteps([]);
      setFileText("");
      setFileName(null);
      setAiAcknowledged(false);
      showToast(`Private draft saved with ${getPlanSteps(result).length} reviewable steps.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The draft plan could not be saved.";
      setSaveError(message);
      showToast(message, "error");
    }
  };

  const approve = (plan: AgentPlan) => {
    const steps = getPlanSteps(plan);
    if (!steps.length) {
      showToast("This plan has no valid steps to approve.", "error");
      return;
    }
    const taskLines = steps.map((step, index) => `${index + 1}. [${step.priority.toUpperCase()}] ${step.title}${step.description ? ` — ${step.description}` : ""}`).join("\n");
    showConfirm(
      "Review and approve these tasks",
      `This creates ${steps.length} private Kairos tasks. Nothing is sent to anyone or performed outside the app.\n\n${taskLines}`,
      () => {
        void approvePlan.mutateAsync(plan).then((ids) => showToast(`${ids.length} task${ids.length === 1 ? "" : "s"} created from the approved plan.`, "success"))
          .catch((error: unknown) => showToast(error instanceof Error ? error.message : "The approved tasks could not be created.", "error"));
      },
    );
  };

  const resetMemoryForm = () => {
    setMemoryId(undefined);
    setMemoryTitle("");
    setMemoryContent("");
    setMemoryCategory("general");
    setSaveError(null);
  };

  const editMemory = (item: AgentMemory) => {
    setMemoryId(item.id);
    setMemoryTitle(item.title);
    setMemoryContent(item.content);
    setMemoryCategory(item.category);
    setSaveError(null);
  };

  const saveMemoryForm = async () => {
    setSaveError(null);
    try {
      await saveMemory.mutateAsync({ id: memoryId, title: memoryTitle, content: memoryContent, category: memoryCategory });
      resetMemoryForm();
      showToast("Private memory saved. It is not automatically included in AI requests.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Memory could not be saved.";
      setSaveError(message);
      showToast(message, "error");
    }
  };

  const confirmDeleteMemory = (item: AgentMemory) => showConfirm(
    "Delete private memory?",
    `“${item.title}” will be permanently removed. Existing Evergreen conversation history is not erased.`,
    () => void deleteMemory.mutateAsync(item.id).then(() => {
      setSelectedMemoryIds((ids) => ids.filter((id) => id !== item.id));
      if (memoryId === item.id) resetMemoryForm();
      showToast("Private memory deleted.", "success");
    }).catch((error: unknown) => showToast(error instanceof Error ? error.message : "Memory could not be deleted.", "error")),
    true,
  );

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader showBack title="Agent Desk" subtitle="Private plans. You stay in control." />
          <View style={styles.sectionTabs}>
            {SECTIONS.map((item) => <KairosChip key={item.id} label={item.label} selected={section === item.id} onPress={() => setSection(item.id)} />)}
          </View>

          {!canUseCloud ? (
            <StatePanel icon="lock-outline" title="Sign in for private cloud work" message="Preview mode is deliberately offline: it does not call AI or save memories, plans, approvals, or history. Sign in to use your account-backed data." />
          ) : null}

          {section === "plan" ? (
            <View style={styles.stack}>
              <KairosCard style={styles.noticeCard}>
                <View style={styles.inlineTitle}><MaterialIcons name="verified-user" size={20} color={colors.primary} /><Text style={[styles.cardHeading, { color: colors.foreground }]}>Nothing runs without your review</Text></View>
                <Text style={[styles.body, { color: colors.muted }]}>Evergreen drafts ordinary tasks only. You can edit every step, save a private draft, and review the exact task payload before approval. Approval creates Kairos tasks; it does not send messages, spend money, or trigger external actions.</Text>
              </KairosCard>

              <KairosInput
                label="What would you like help planning?"
                value={goal}
                onChangeText={(value) => { setGoal(value); setAiAcknowledged(false); }}
                multiline
                maxLength={2000}
                placeholder="For example: prepare for a calm, focused project handover next week"
                helperText={`${goal.length}/2,000 characters`}
              />

              <KairosCard style={styles.fileCard}>
                <View style={styles.inlineTitle}><MaterialIcons name="description" size={20} color={colors.primary} /><Text style={[styles.cardHeading, { color: colors.foreground }]}>Optional local text file</Text></View>
                <Text style={[styles.body, { color: colors.muted }]}>Supported: UTF-8 .txt, .md, .csv, .json, .html, .htm, .xml, and .log files up to 200 KiB. Extraction and formatting happen on this device; selected text is sent only when you press Draft plan and is not saved in the plan record. PDF, Word, and spreadsheet files are not supported.</Text>
                <KairosButton compact tone="secondary" icon="upload-file" label={fileName ? "Choose a different file" : "Choose a file"} onPress={() => void pickTextFile()} />
                {fileName ? <View style={styles.fileRow}><Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{fileName} · {fileText.length.toLocaleString()} characters ready</Text><PressableScale accessibilityLabel="Remove selected file" onPress={() => { setFileName(null); setFileText(""); setAiAcknowledged(false); }}><MaterialIcons name="close" size={20} color={colors.muted} /></PressableScale></View> : null}
              </KairosCard>

              <KairosCard style={styles.memoryPickCard}>
                <View style={styles.inlineTitle}><MaterialIcons name="psychology" size={20} color={colors.primary} /><Text style={[styles.cardHeading, { color: colors.foreground }]}>Choose memories to include</Text></View>
                <Text style={[styles.body, { color: colors.muted }]}>Saved memories are private by default and are included only when you select them here.</Text>
                {(memories.data ?? []).length ? (memories.data ?? []).map((item) => {
                  const checked = selectedMemoryIds.includes(item.id);
                  return <PressableScale key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`Include memory ${item.title}`} onPress={() => { if (!checked && selectedMemoryIds.length >= 3) { showToast("Choose up to three memories for one planning request.", "error"); return; } setSelectedMemoryIds((ids) => checked ? ids.filter((id) => id !== item.id) : [...ids, item.id]); setAiAcknowledged(false); }} style={[styles.memoryOption, { borderColor: checked ? colors.primary : colors.border }]}><MaterialIcons name={checked ? "check-box" : "check-box-outline-blank"} size={20} color={checked ? colors.primary : colors.muted} /><View style={styles.flex}><Text numberOfLines={2} style={[styles.memoryOptionText, { color: colors.foreground }]}>{item.title}</Text><Text numberOfLines={3} style={[styles.meta, { color: colors.muted }]}>{item.content}</Text></View></PressableScale>;
                }) : <Text style={[styles.body, { color: colors.muted }]}>{memories.isLoading ? "Loading saved memories…" : "No saved memories yet. Add them in My memory if you want them available for selected requests."}</Text>}
              </KairosCard>

              <KairosCard style={styles.consentCard}>
                <View style={styles.consentRow}>
                  <View style={styles.flex}><Text style={[styles.cardHeading, { color: colors.foreground }]}>Allow this planning request</Text><Text style={[styles.body, { color: colors.muted }]}>When you draft, the goal, selected file name and text, and selected memories go to the Agent Desk service. OpenAI's moderation service screens the goal, file text, and memories; the configured AI provider (OpenAI or Kimi; fallback may be used) processes them. The file name is excluded from the moderation and AI prompt. This endpoint does not retrieve other Kairos account context or save the prompt or response in Kairos interaction history. AI providers handle submitted content under their own terms. If you save a draft, its goal, file name, and task steps are stored privately; file text is not. Avoid content you do not want processed.</Text></View>
                  <Switch accessibilityLabel="Acknowledge Evergreen data use" value={aiAcknowledged} onValueChange={setAiAcknowledged} trackColor={{ false: colors.border, true: colors.primary }} />
                </View>
              </KairosCard>

              {saveError ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.error }]}>{saveError}</Text> : null}
              <KairosButton label="Draft plan with AI" icon="auto-awesome" loading={draftPlanMutation.isPending} disabled={!canUseCloud || !aiAcknowledged || goal.trim().length < 3} onPress={() => void draftPlan()} />

              {generatedSteps.length ? (
                <KairosCard style={styles.stack}>
                  <Text style={[styles.cardHeading, { color: colors.foreground }]}>Review and edit the draft</Text>
                  <Text style={[styles.body, { color: colors.muted }]}>AI output can be wrong. Edit or remove any step before saving this plan.</Text>
                  {generatedSteps.map((step, index) => <View key={`${index}-${step.title}`} style={[styles.stepEditor, { borderColor: colors.border }]}>
                    <View style={styles.stepHeader}><Text style={[styles.stepNumber, { color: colors.primary }]}>STEP {index + 1}</Text><PressableScale accessibilityLabel={`Remove step ${index + 1}`} onPress={() => setGeneratedSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}><MaterialIcons name="delete-outline" size={21} color={colors.error} /></PressableScale></View>
                    <TextInput accessibilityLabel={`Task title ${index + 1}`} value={step.title} onChangeText={(value) => updateGeneratedStep(index, { title: value.slice(0, 200) })} maxLength={200} placeholder="Task title" placeholderTextColor={colors.tertiary} style={[styles.inlineInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]} />
                    <TextInput accessibilityLabel={`Task description ${index + 1}`} value={step.description} onChangeText={(value) => updateGeneratedStep(index, { description: value.slice(0, 2000) })} multiline maxLength={2000} placeholder="Optional description" placeholderTextColor={colors.tertiary} style={[styles.inlineInput, styles.descriptionInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]} />
                    <Text style={[styles.meta, { color: colors.muted }]}>Priority</Text><View style={styles.chipRow}>{(["low", "medium", "high"] as const).map((priority) => <KairosChip key={priority} label={priority} selected={step.priority === priority} onPress={() => updateGeneratedStep(index, { priority })} />)}</View>
                  </View>)}
                  {generatedSteps.length < 8 ? <KairosButton compact tone="secondary" icon="add" label="Add a task step" onPress={() => setGeneratedSteps((current) => [...current, { title: "", description: "", priority: "medium" }])} /> : null}
                  <KairosButton label="Save private draft" icon="save" loading={savePlan.isPending} disabled={!canUseCloud || generatedSteps.length < 1 || generatedSteps.some((step) => !step.title.trim())} onPress={() => void saveDraftPlan()} />
                </KairosCard>
              ) : null}

              <View style={styles.listHeader}><Text style={[styles.cardHeading, { color: colors.foreground }]}>Saved plans</Text><Text style={[styles.body, { color: colors.muted }]}>Drafts need your review before tasks are created.</Text></View>
              {plans.isLoading ? <StatePanel loading title="Loading your plans" message="Private plans stay attached to your signed-in account." /> : plans.isError ? <StatePanel icon="error-outline" title="Plans unavailable" message={plans.error instanceof Error ? plans.error.message : "Check your connection and the Agent Desk migration."} actionLabel="Retry" onAction={() => void plans.refetch()} /> : (plans.data ?? []).length ? (plans.data ?? []).map((plan) => <PlanCard key={plan.id} plan={plan} onApprove={() => approve(plan)} />) : <StatePanel icon="event-note" title="No saved plans yet" message="Draft a plan above, edit the steps, then save it privately." />}
            </View>
          ) : null}

          {section === "sources" ? <SourceDiscoverySection key={user?.id ?? "anonymous"} /> : null}

          {section === "memory" ? (
            <View style={styles.stack}>
              <KairosCard style={styles.noticeCard}>
                <View style={styles.inlineTitle}><MaterialIcons name="lock" size={20} color={colors.primary} /><Text style={[styles.cardHeading, { color: colors.foreground }]}>Private, editable, and opt-in</Text></View>
                <Text style={[styles.body, { color: colors.muted }]}>Memories are stored in your account and are not automatically attached to AI requests. Choose which items to include on Plan & review. Deleting a memory does not erase prompts already saved in Evergreen history.</Text>
              </KairosCard>
              <KairosInput label="Memory title" value={memoryTitle} onChangeText={setMemoryTitle} maxLength={80} placeholder="A preference or useful context" />
              <KairosInput label="Memory text" value={memoryContent} onChangeText={setMemoryContent} multiline maxLength={2000} placeholder="Write only what you want saved for future requests" helperText={`${memoryContent.length}/2,000 characters`} />
              <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
              <View style={styles.chipRow}>{MEMORY_CATEGORIES.map((item) => <KairosChip key={item.value} label={item.label} selected={memoryCategory === item.value} onPress={() => setMemoryCategory(item.value)} />)}</View>
              {saveError ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.error }]}>{saveError}</Text> : null}
              <View style={styles.actionRow}><KairosButton style={styles.flex} label={memoryId ? "Update memory" : "Save memory"} icon="save" loading={saveMemory.isPending} disabled={!canUseCloud || !memoryTitle.trim() || !memoryContent.trim()} onPress={() => void saveMemoryForm()} />{memoryId ? <KairosButton tone="secondary" label="Cancel" onPress={resetMemoryForm} /> : null}</View>
              <View style={styles.listHeader}><Text style={[styles.cardHeading, { color: colors.foreground }]}>Saved memories</Text></View>
              {memories.isLoading ? <StatePanel loading title="Loading memories" message="Only your signed-in account can read these." /> : memories.isError ? <StatePanel icon="error-outline" title="Memories unavailable" message={memories.error instanceof Error ? memories.error.message : "Check your connection and migration."} actionLabel="Retry" onAction={() => void memories.refetch()} /> : (memories.data ?? []).length ? (memories.data ?? []).map((item) => <KairosCard key={item.id} style={styles.memoryCard}>
                <View style={styles.memoryHeading}><View style={styles.flex}><Text style={[styles.memoryTitle, { color: colors.foreground }]}>{item.title}</Text><KairosBadge label={item.category} tone="neutral" /></View><View style={styles.iconActions}><PressableScale accessibilityLabel={`Edit memory ${item.title}`} onPress={() => editMemory(item)}><MaterialIcons name="edit" size={20} color={colors.primary} /></PressableScale><PressableScale accessibilityLabel={`Delete memory ${item.title}`} onPress={() => confirmDeleteMemory(item)}><MaterialIcons name="delete-outline" size={21} color={colors.error} /></PressableScale></View></View>
                <Text style={[styles.body, { color: colors.muted }]}>{item.content}</Text>
                <Text style={[styles.meta, { color: colors.tertiary }]}>Updated {new Date(item.updated_at).toLocaleDateString()}</Text>
              </KairosCard>) : <StatePanel icon="psychology" title="No saved memories" message="Add a small, useful preference here. Nothing is sent to Evergreen unless you select it for a request." />}
            </View>
          ) : null}

          {section === "history" ? (
            <View style={styles.stack}>
              <KairosCard style={styles.noticeCard}>
                <View style={styles.inlineTitle}><MaterialIcons name="history" size={20} color={colors.primary} /><Text style={[styles.cardHeading, { color: colors.foreground }]}>Private activity record</Text></View>
                <Text style={[styles.body, { color: colors.muted }]}>The database appends metadata when Agent Desk memories or plans are created, edited, deleted, or approved. It does not copy your memory text, file contents, or goal into this log. Older entries load in private, time-ordered pages; the record cannot be changed from the app.</Text>
              </KairosCard>
              {history.isLoading ? <StatePanel loading title="Loading activity" message="Reading your private account history." /> : history.isError && historyEvents.length === 0 ? <StatePanel icon="error-outline" title="Activity unavailable" message={history.error instanceof Error ? history.error.message : "Check your connection and migration."} actionLabel="Retry" onAction={() => void history.refetch()} /> : historyEvents.length ? historyEvents.map((event) => <KairosCard key={event.id} style={styles.historyCard}>
                <View style={styles.historyTop}><KairosBadge label={actionLabel(event.action)} tone={event.action === "delete" ? "error" : event.action === "plan_approved" ? "success" : "neutral"} /><Text style={[styles.meta, { color: colors.muted }]}>{new Date(event.created_at).toLocaleString()}</Text></View>
                <Text style={[styles.body, { color: colors.foreground }]}>{event.summary}</Text>
                <Text style={[styles.meta, { color: colors.tertiary }]}>{event.object_type.replaceAll("_", " ")}</Text>
              </KairosCard>) : <StatePanel icon="history" title="No activity recorded" message="Changes to Agent Desk memories and plans will appear here after the migration is deployed." />}
              {historyEvents.length > 0 && history.hasNextPage ? <KairosButton compact tone="secondary" label={history.isFetchingNextPage ? "Loading earlier activity…" : "Load earlier activity"} loading={history.isFetchingNextPage} disabled={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} /> : null}
              {history.isFetchNextPageError ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.error }]}>Older activity could not be loaded. Check your connection and try again.</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function PlanCard({ plan, onApprove }: { plan: AgentPlan; onApprove: () => void }) {
  const colors = useColors();
  const steps = getPlanSteps(plan);
  return <KairosCard style={styles.planCard}>
    <View style={styles.planTop}><KairosBadge label={plan.status === "approved" ? "Approved" : "Needs review"} tone={plan.status === "approved" ? "success" : "warning"} /><Text style={[styles.meta, { color: colors.muted }]}>{new Date(plan.created_at).toLocaleDateString()}</Text></View>
    <Text style={[styles.goalText, { color: colors.foreground }]}>{plan.goal}</Text>
    {plan.source_file_name ? <Text style={[styles.meta, { color: colors.muted }]}>Source: {plan.source_file_name} (the file text is not stored in this plan)</Text> : null}
    <View style={styles.stepList}>{steps.map((step, index) => <View key={`${plan.id}-${index}`} style={styles.savedStep}><Text style={[styles.stepNumber, { color: colors.primary }]}>{index + 1}.</Text><View style={styles.flex}><Text style={[styles.savedStepTitle, { color: colors.foreground }]}>{step.title}</Text><KairosBadge label={`${step.priority} priority`} tone={step.priority === "high" ? "warning" : "neutral"} />{step.description ? <Text style={[styles.body, { color: colors.muted }]}>{step.description}</Text> : null}</View></View>)}</View>
    {plan.status === "draft" ? <KairosButton compact icon="task-alt" label={`Review & create ${steps.length} task${steps.length === 1 ? "" : "s"}`} onPress={onApprove} disabled={!steps.length} /> : <Text style={[styles.meta, { color: colors.success }]}>Created {plan.task_ids.length} task{plan.task_ids.length === 1 ? "" : "s"} in your private Tasks list.</Text>}
  </KairosCard>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: 16, padding: 20, paddingBottom: 40 },
  sectionTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stack: { gap: 14 },
  noticeCard: { gap: 10 },
  fileCard: { gap: 10 },
  memoryPickCard: { gap: 10 },
  consentCard: { gap: 10 },
  inlineTitle: { flexDirection: "row", alignItems: "center", gap: 9 },
  cardHeading: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  body: { fontSize: 13, lineHeight: 19 },
  meta: { fontSize: 11, lineHeight: 16 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  fileRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  fileName: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  memoryOption: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  memoryOptionText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  errorText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  stepEditor: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  stepHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepNumber: { fontSize: 11, lineHeight: 15, fontWeight: "900", letterSpacing: 1 },
  inlineInput: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, lineHeight: 19 },
  descriptionInput: { minHeight: 72, textAlignVertical: "top" },
  listHeader: { gap: 4, paddingTop: 6 },
  planCard: { gap: 12 },
  planTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalText: { fontSize: 15, lineHeight: 21, fontWeight: "700" },
  stepList: { gap: 10 },
  savedStep: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  savedStepTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  label: { fontSize: 14, lineHeight: 19, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  memoryCard: { gap: 11 },
  memoryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  memoryTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800", marginBottom: 6 },
  iconActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  historyCard: { gap: 8 },
  historyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
});
