import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Switch, Text, View } from "react-native";

import { KairosBadge } from "@/components/kairos/badge";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosChip } from "@/components/kairos/chip";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { StatePanel } from "@/components/kairos/state-panel";
import { useAevumConsents } from "@/hooks/use-aevum";
import { useColors } from "@/hooks/use-colors";
import { useSourceBriefTasks, type SourceBriefTaskRecord } from "@/hooks/use-source-brief";
import { createSourceBrief, type SourceBriefTask } from "@/lib/source-brief-api";
import { exportSourceBrief } from "@/lib/source-brief-export";
import { saveSourceAiConsent, type SourceAiConsentScope } from "@/lib/source-consent-api";
import { discoverSources } from "@/lib/source-discovery-api";
import type { DiscoveryScope, SourceCandidate } from "@/lib/source-discovery";
import { addSelectedSource, isSafeManualHttpsUrl, removeSelectedSource, type SelectedDiscoverySource, MAX_SELECTED_SOURCES } from "@/lib/source-discovery-selection";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import type { Json } from "@/types/database";

type SearchSnapshot = { accountId: string; scope: DiscoveryScope; goal: string; candidates: SourceCandidate[] };

function displayHost(raw: string) {
  try { return new URL(raw).hostname; } catch { return raw; }
}

function readStoredSources(value: Json): SelectedDiscoverySource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SelectedDiscoverySource[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, Json | undefined>;
    if (typeof source.url !== "string" || typeof source.title !== "string" || (source.origin !== "candidate" && source.origin !== "manual")) return [];
    return [{ url: source.url, title: source.title, origin: source.origin, label: "Not read or fact-verified" }];
  });
}

function taskSources(task: SourceBriefTaskRecord) {
  return readStoredSources(task.selected_sources);
}

export function SourceDiscoverySection() {
  const colors = useColors();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const coachingConsents = useAevumConsents();
  const userId = user?.id ?? null;
  const canUseCloud = Boolean(user && !user.isPreview);
  const coachingActive = coachingConsents.data?.coaching === true;

  const [goal, setGoal] = useState("");
  const [goalOwnerId, setGoalOwnerId] = useState<string | null>(null);
  const goalForUser = goalOwnerId === userId ? goal : "";
  const [scope, setScope] = useState<DiscoveryScope>("evergreen");
  const [searchAcknowledged, setSearchAcknowledged] = useState(false);
  const [briefAcknowledged, setBriefAcknowledged] = useState(false);
  const [savingConsent, setSavingConsent] = useState<SourceAiConsentScope | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [manualOwnerId, setManualOwnerId] = useState<string | null>(null);
  const [manualSources, setManualSources] = useState<SelectedDiscoverySource[]>([]);
  const manualSourcesForUser = useMemo(() => manualOwnerId === userId ? manualSources : [], [manualOwnerId, manualSources, userId]);
  const [addedCandidates, setAddedCandidates] = useState<SelectedDiscoverySource[]>([]);
  const [searchSnapshot, setSearchSnapshot] = useState<SearchSnapshot | null>(null);
  const visibleCandidates = searchSnapshot && searchSnapshot.accountId === userId && searchSnapshot.scope === scope && searchSnapshot.goal === goalForUser.trim() && searchAcknowledged
    ? searchSnapshot.candidates
    : null;
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const taskHistory = useSourceBriefTasks(briefLoading);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<SourceBriefTask | null>(null);
  const [taskOwnerId, setTaskOwnerId] = useState<string | null>(null);
  const taskForUser = taskOwnerId === userId ? task : null;
  const [exporting, setExporting] = useState(false);
  const requestToken = useRef(0);
  const consentToken = useRef(0);
  const allSelected = useMemo(() => [...manualSourcesForUser, ...addedCandidates], [manualSourcesForUser, addedCandidates]);

  useEffect(() => {
    requestToken.current += 1;
    consentToken.current += 1;
    setSearchSnapshot(null);
    setAddedCandidates([]);
    setManualSources([]);
    setManualOwnerId(null);
    setManualUrl("");
    setGoal("");
    setGoalOwnerId(null);
    setScope("evergreen");
    setSearchAcknowledged(false);
    setBriefAcknowledged(false);
    setDiscoveryLoading(false);
    setTask(null);
    setTaskOwnerId(null);
    setError(null);
  }, [userId]);

  useEffect(() => () => { requestToken.current += 1; consentToken.current += 1; }, []);

  const invalidateResults = () => {
    requestToken.current += 1;
    setDiscoveryLoading(false);
    setSearchSnapshot(null);
    setAddedCandidates([]);
    setTask(null);
    setTaskOwnerId(null);
  };

  const updateGoal = (value: string) => {
    setGoal(value);
    setGoalOwnerId(userId);
    setError(null);
    setSearchAcknowledged(false);
    setBriefAcknowledged(false);
    invalidateResults();
  };

  const updateConsent = async (kind: SourceAiConsentScope, enabled: boolean) => {
    if (!userId || !canUseCloud) return;
    const token = ++consentToken.current;
    setSavingConsent(kind);
    setError(null);
    if (kind === "search") {
      setSearchAcknowledged(enabled);
      if (!enabled) invalidateResults();
    } else {
      setBriefAcknowledged(enabled);
      if (!enabled) invalidateResults();
    }
    try {
      await saveSourceAiConsent({ userId, scope: kind, granted: enabled });
      if (consentToken.current !== token || userId !== (user?.id ?? null)) return;
      if (enabled) showToast(kind === "search" ? "Web-search consent recorded. It applies only after you press Search." : "Task AI-processing consent recorded. It applies only after you create a task.", "success");
    } catch (consentError) {
      if (consentToken.current !== token) return;
      if (kind === "search") setSearchAcknowledged(false);
      else setBriefAcknowledged(false);
      invalidateResults();
      setError(consentError instanceof Error ? consentError.message : "Your source AI consent could not be saved.");
    } finally {
      if (consentToken.current === token) setSavingConsent(null);
    }
  };

  const startDiscovery = async () => {
    setError(null);
    if (!canUseCloud) { setError("Sign in with a connected account to search and save source briefs."); return; }
    if (goalForUser.trim().length < 3 || goalForUser.trim().length > 600) { setError("Source search needs a goal between 3 and 600 characters. You can still create a manual task with a goal up to 2,000 characters."); return; }
    if (!searchAcknowledged) { setError("Enable the separate source-search consent before searching."); return; }
    if (scope === "aevum" && !coachingActive) { setError("Aevum source search also requires active Aevum coaching consent."); return; }

    const token = ++requestToken.current;
    const snapshot = { accountId: userId ?? "", scope, goal: goalForUser.trim() };
    setDiscoveryLoading(true);
    setSearchSnapshot(null);
    setAddedCandidates([]);
    setTask(null);
    setTaskOwnerId(null);
    try {
      const result = await discoverSources({ goal: snapshot.goal, scope: snapshot.scope, search_ai_consent: true });
      if (requestToken.current !== token || userId !== snapshot.accountId || scope !== snapshot.scope || goalForUser.trim() !== snapshot.goal || !searchAcknowledged) return;
      setSearchSnapshot({ ...snapshot, candidates: result.candidates });
      if (!result.candidates.length) showToast("No approved candidate links were returned. You can still add an approved HTTPS link manually.", "info");
    } catch (requestError) {
      if (requestToken.current !== token) return;
      setSearchSnapshot(null);
      setError(requestError instanceof Error ? requestError.message : "Source discovery is unavailable.");
    } finally {
      if (requestToken.current === token) setDiscoveryLoading(false);
    }
  };

  const cancelDiscovery = () => {
    invalidateResults();
    setError("Search cancelled locally. Any provider request already in flight cannot be recalled; reserved usage is not refunded.");
  };

  const addManualSource = () => {
    const value = manualUrl.trim();
    if (!isSafeManualHttpsUrl(value)) { setError("Enter a valid HTTPS URL with no embedded credentials or custom port."); return; }
    if (!userId) { setError("Sign in before selecting a private source."); return; }
    const candidate: SelectedDiscoverySource = { url: value, title: displayHost(value), label: "Not read or fact-verified", origin: "manual" };
    const next = addSelectedSource(allSelected, candidate);
    if (next.length === allSelected.length) {
      setError(allSelected.some((source) => source.url === value) ? "That URL is already selected." : "Choose up to three sources total. Remove one before adding another.");
      return;
    }
    setManualSources((current) => addSelectedSource(manualOwnerId === userId ? current : [], candidate));
    setManualOwnerId(userId);
    setManualUrl("");
    setBriefAcknowledged(false);
    setTask(null);
    setTaskOwnerId(null);
    setError(null);
  };

  const removeSource = (url: string) => {
    setManualSources((current) => removeSelectedSource(current, url));
    setAddedCandidates((current) => removeSelectedSource(current, url));
    setBriefAcknowledged(false);
    setTask(null);
    setTaskOwnerId(null);
  };

  const addCandidate = (candidate: SourceCandidate) => {
    const source: SelectedDiscoverySource = { ...candidate, origin: "candidate" };
    const next = addSelectedSource(allSelected, source);
    if (next.length === allSelected.length) {
      setError(allSelected.some((item) => item.url === source.url) ? "That source is already selected." : "Choose up to three sources total. Remove one before adding another.");
      return;
    }
    setAddedCandidates((current) => addSelectedSource(current, source));
    setBriefAcknowledged(false);
    setTask(null);
    setTaskOwnerId(null);
    setError(null);
  };

  const makeBrief = async () => {
    setError(null);
    if (!canUseCloud) { setError("Sign in with a connected account before creating a private source brief."); return; }
    if (goalForUser.trim().length < 3 || goalForUser.trim().length > 2000) { setError("Enter a task goal between 3 and 2,000 characters."); return; }
    if (allSelected.length < 1 || allSelected.length > MAX_SELECTED_SOURCES) { setError("Add between one and three source links first."); return; }
    if (!briefAcknowledged) { setError("Enable the separate task-AI processing consent before creating a task."); return; }
    if (scope === "aevum" && !coachingActive) { setError("Aevum source tasks require active Aevum coaching consent."); return; }

    setBriefLoading(true);
    try {
      const result = await createSourceBrief({
        goal: goalForUser.trim(),
        scope,
        selected_sources: allSelected.map(({ url, title, origin }) => ({ url, title, origin })),
        task_ai_consent: true,
      });
      if (userId !== (user?.id ?? null)) return;
      setTask(result);
      setTaskOwnerId(userId);
      await taskHistory.refetch();
      setBriefAcknowledged(false);
      showToast(result.status === "completed" ? "Private cited brief created." : `Source task ${result.status.replaceAll("_", " ")}.`, "success");
    } catch (requestError) {
      setTask(null);
      setTaskOwnerId(null);
      void taskHistory.refetch();
      setError(requestError instanceof Error ? requestError.message : "The source brief task could not be created.");
    } finally {
      setBriefLoading(false);
    }
  };

  const downloadBrief = async (format: "markdown" | "text" = "markdown") => {
    if (!taskForUser?.markdown || taskForUser.status !== "completed") return;
    setExporting(true);
    try {
      await exportSourceBrief(taskForUser.markdown, taskForUser.id, format);
      showToast(Platform.OS === "web" ? `${format === "markdown" ? "Markdown" : "Text"} download started.` : `${format === "markdown" ? "Markdown" : "Text"} brief shared. Save it somewhere private.`, "success");
    } catch (exportError) {
      showToast(exportError instanceof Error ? exportError.message : "The brief could not be exported.", "error");
    } finally {
      setExporting(false);
    }
  };

  const downloadStoredTask = async (record: SourceBriefTaskRecord, format: "markdown" | "text" = "markdown") => {
    if (!record.markdown_content || record.status !== "completed") return;
    try {
      await exportSourceBrief(record.markdown_content, record.id, format);
      showToast(Platform.OS === "web" ? `${format === "markdown" ? "Markdown" : "Text"} download started.` : `${format === "markdown" ? "Markdown" : "Text"} brief shared. Save it somewhere private.`, "success");
    } catch (exportError) {
      showToast(exportError instanceof Error ? exportError.message : "The brief could not be exported.", "error");
    }
  };

  const reuseFailedTaskInputs = (record: SourceBriefTaskRecord) => {
    setGoal(record.goal);
    setGoalOwnerId(userId);
    setScope(record.scope);
    setManualSources(taskSources(record));
    setManualOwnerId(userId);
    setAddedCandidates([]);
    setSearchAcknowledged(false);
    setBriefAcknowledged(false);
    setSearchSnapshot(null);
    setTask(null);
    setTaskOwnerId(null);
    setError("Task inputs restored. Review them and renew the separate task-AI acknowledgment before submitting another task.");
  };

  const canSearch = canUseCloud && searchAcknowledged && savingConsent !== "search" && goalForUser.trim().length >= 3 && goalForUser.trim().length <= 600 && !discoveryLoading && (scope !== "aevum" || coachingActive);
  const canCreateBrief = canUseCloud && briefAcknowledged && savingConsent !== "brief" && allSelected.length > 0 && allSelected.length <= MAX_SELECTED_SOURCES && goalForUser.trim().length >= 3 && goalForUser.trim().length <= 2000 && !briefLoading && (scope !== "aevum" || coachingActive);
  const selectedCandidateUrls = new Set(addedCandidates.map((source) => source.url));
  const manualSelectionUrls = new Set(manualSourcesForUser.map((source) => source.url));

  return (
    <View style={styles.stack}>
      <KairosCard style={styles.card}>
        <View style={styles.titleRow}><MaterialIcons name="travel-explore" size={21} color={colors.primary} /><Text style={[styles.heading, { color: colors.foreground }]}>Find sources, then make a cited brief</Text></View>
        <Text style={[styles.body, { color: colors.muted }]}>Search never creates a task. Inspect links and explicitly add only the sources you want; then separately ask AI to read only those links. No messages, purchases, or other external actions are performed.</Text>
        <View style={styles.chips}>{([{ id: "evergreen", label: "Evergreen" }, { id: "aevum", label: "Aevum" }] as const).map((item) => <KairosChip key={item.id} label={item.label} selected={scope === item.id} onPress={() => { setScope(item.id); setSearchAcknowledged(false); setBriefAcknowledged(false); setError(null); invalidateResults(); }} />)}</View>
        <KairosInput label="What do you want to learn?" value={goalForUser} onChangeText={updateGoal} multiline maxLength={2000} placeholder="For example: compare practical approaches to building a consistent sleep routine" helperText={`${goalForUser.length}/2,000 characters · source search accepts up to 600`} />
        <KairosCard style={[styles.consentCard, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={styles.consentRow}>
            <View style={styles.flex}><Text style={[styles.subheading, { color: colors.foreground }]}>Allow web search of this goal</Text><Text style={[styles.smallBody, { color: colors.muted }]}>Only a goal of 3–600 characters is sent to the configured web-search AI provider with the app owner's approved domain list. Search returns candidate links, not a task; results are not read or fact-verified. This consent is separate from task AI-processing consent.</Text></View>
            <Switch value={searchAcknowledged} onValueChange={(value) => void updateConsent("search", value)} disabled={!canUseCloud || savingConsent === "search"} accessibilityLabel="Allow web search of this goal on approved sites" trackColor={{ false: colors.border, true: colors.primary }} />
          </View>
          {scope === "aevum" ? <Text style={[styles.smallBody, { color: coachingActive ? colors.success : colors.error }]}>{coachingConsents.isLoading ? "Checking Aevum coaching consent…" : coachingActive ? "Active Aevum coaching consent confirmed; it is additionally required for search and tasks." : "Aevum coaching consent is not active. Enable it in Aevum Coach before searching or creating an Aevum task."}</Text> : null}
          <KairosButton label={discoveryLoading ? "Searching approved sources…" : "Find sources"} icon="search" onPress={() => void startDiscovery()} disabled={!canSearch} loading={discoveryLoading} />
          {discoveryLoading ? <KairosButton compact tone="secondary" label="Cancel search" onPress={cancelDiscovery} /> : null}
          {goalForUser.trim().length > 600 ? <Text style={[styles.smallBody, { color: colors.muted }]}>This goal is too long for source search; manual source tasks still support up to 2,000 characters.</Text> : null}
        </KairosCard>
      </KairosCard>

      {!canUseCloud ? <StatePanel icon="lock-outline" title="Sign in for private source work" message="Preview mode is offline and will not call search or AI or save a task. Sign in to use this workflow." /> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

      <KairosCard style={styles.card}>
        <View style={styles.titleRow}><MaterialIcons name="link" size={20} color={colors.primary} /><Text style={[styles.heading, { color: colors.foreground }]}>Selected sources · {allSelected.length}/{MAX_SELECTED_SOURCES}</Text></View>
        <Text style={[styles.smallBody, { color: colors.muted }]}>Add up to three approved HTTPS links. Manual links remain selected when you search again or edit the goal. The server retrieves only domains in its owner-approved registry.</Text>
        {allSelected.length ? allSelected.map((source, index) => <View key={`${source.origin}-${source.url}`} style={[styles.manualRow, { borderColor: colors.border }]}>
          <Text style={[styles.citationNumber, { color: colors.primary }]}>{index + 1}.</Text>
          <View style={styles.flex}><Text style={[styles.sourceTitle, { color: colors.foreground }]}>{source.title} · {source.origin === "manual" ? "manual" : "candidate"}</Text><Text style={[styles.sourceUrl, { color: colors.primary }]} selectable>{source.url}</Text><KairosBadge label={source.label} tone="warning" /></View>
          <PressableScale accessibilityLabel={`Remove source ${source.url}`} onPress={() => removeSource(source.url)}><MaterialIcons name="close" size={21} color={colors.error} /></PressableScale>
        </View>) : <Text style={[styles.body, { color: colors.muted }]}>No sources added yet. You can search first, or add an approved link manually.</Text>}
        <KairosInput label="Add a manual HTTPS URL" value={manualUrl} onChangeText={setManualUrl} maxLength={2048} autoCapitalize="none" keyboardType="url" placeholder="https://example.org/article" />
        <KairosButton compact tone="secondary" icon="add-link" label="Add manual URL" onPress={addManualSource} disabled={!manualUrl.trim() || allSelected.length >= MAX_SELECTED_SOURCES || !canUseCloud} />
      </KairosCard>

      {visibleCandidates ? <KairosCard style={styles.card}>
        <View style={styles.titleRow}><MaterialIcons name="fact-check" size={20} color={colors.primary} /><Text style={[styles.heading, { color: colors.foreground }]}>Review candidate links</Text></View>
        <Text style={[styles.smallBody, { color: colors.muted }]}>Search found {visibleCandidates.length} candidate link{visibleCandidates.length === 1 ? "" : "s"}. They are not read or fact-verified. Press Add source for each page you want; this does not create a task.</Text>
        {visibleCandidates.length ? visibleCandidates.map((candidate, index) => {
          const selected = selectedCandidateUrls.has(candidate.url);
          const manualDuplicate = manualSelectionUrls.has(candidate.url);
          return <View key={`${candidate.url}-${index}`} style={[styles.sourceRow, { borderColor: selected || manualDuplicate ? colors.primary : colors.border }]}>
            <View style={styles.flex}><Text style={[styles.sourceTitle, { color: colors.foreground }]}>{candidate.title}</Text><PressableScale accessibilityRole="link" accessibilityLabel={`Open candidate source ${candidate.title}`} onPress={() => void Linking.openURL(candidate.url)}><Text style={[styles.sourceUrl, { color: colors.primary }]} selectable>{candidate.url}</Text></PressableScale><KairosBadge label={candidate.label} tone="warning" /></View>
            <KairosButton compact tone={selected || manualDuplicate ? "secondary" : "primary"} icon={selected || manualDuplicate ? "remove-circle-outline" : "add-link"} label={selected || manualDuplicate ? "Remove source" : "Add source"} onPress={() => selected || manualDuplicate ? removeSource(candidate.url) : addCandidate(candidate)} disabled={!selected && !manualDuplicate && allSelected.length >= MAX_SELECTED_SOURCES} />
          </View>;
        }) : <Text style={[styles.body, { color: colors.muted }]}>No approved candidate links. You can still add a manual URL from an approved domain.</Text>}
      </KairosCard> : null}

      {allSelected.length > 0 ? <KairosCard style={[styles.card, styles.consentCard]}>
        <View style={styles.consentRow}>
          <View style={styles.flex}><Text style={[styles.subheading, { color: colors.foreground }]}>Separate task AI-processing acknowledgment</Text><Text style={[styles.smallBody, { color: colors.muted }]}>When you press Create and run task, your goal and only the selected URLs and retrieved page text go to the configured AI provider to draft a private cited Markdown brief. Task and result are stored in your account. AI output can be wrong; check every source. Search consent does not cover this step.</Text></View>
          <Switch value={briefAcknowledged} onValueChange={(value) => void updateConsent("brief", value)} disabled={!canUseCloud || savingConsent === "brief"} accessibilityLabel="Acknowledge task AI processing of selected sources" trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
        <KairosButton label={briefLoading ? "Creating and running task…" : "Create and run task"} icon="description" onPress={() => void makeBrief()} disabled={!canCreateBrief} loading={briefLoading} />
        {briefLoading ? <Text style={[styles.smallBody, { color: colors.muted }]}>The task moves through saved retrieval and generation states. Its stored result is published only after citation-structure validation. No live status is claimed until the server returns.</Text> : null}
      </KairosCard> : null}

      {taskForUser ? <KairosCard style={styles.card}>
        <View style={styles.taskHeader}><Text style={[styles.heading, { color: colors.foreground }]}>Your source task</Text><KairosBadge label={taskForUser.status.replaceAll("_", " ")} tone={taskForUser.status === "completed" ? "success" : taskForUser.status === "failed" ? "error" : "warning"} /></View>
        {taskForUser.status === "completed" && taskForUser.markdown ? <>
          <Text style={[styles.smallBody, { color: colors.muted }]}>{taskForUser.source_label ?? "Read by AI; not independently fact-verified."} Check every citation and source before relying on the brief.</Text>
          <Text selectable style={[styles.markdown, { color: colors.foreground }]}>{taskForUser.markdown}</Text>
          <KairosButton label="Download Markdown brief (.md)" icon="download" onPress={() => void downloadBrief("markdown")} loading={exporting} />
          <KairosButton tone="secondary" label="Download text brief (.txt)" icon="text-snippet" onPress={() => void downloadBrief("text")} disabled={exporting} />
        </> : <View style={styles.statusLine}>{taskForUser.status === "failed" ? <MaterialIcons name="error-outline" size={20} color={colors.error} /> : <ActivityIndicator color={colors.primary} />}<Text style={[styles.body, { color: colors.muted }]}>{taskForUser.status === "failed" ? taskForUser.error ?? "The task failed. Check the selected links or service configuration, then try again." : "The task is processing. The task record and status are retained privately in your account."}</Text></View>}
        {taskForUser.selected_sources?.length ? <View style={styles.stack}>{taskForUser.selected_sources.map((source, index) => <PressableScale key={`${taskForUser.id}-${source.url}`} accessibilityRole="link" accessibilityLabel={`Open source ${index + 1}: ${source.title}`} onPress={() => void Linking.openURL(source.url)} style={styles.citationRow}><Text style={[styles.citationNumber, { color: colors.primary }]} >[{index + 1}]</Text><View style={styles.flex}><Text style={[styles.sourceTitle, { color: colors.foreground }]}>{source.title}</Text><Text style={[styles.sourceUrl, { color: colors.primary }]}>{source.url}</Text></View></PressableScale>)}</View> : null}
      </KairosCard> : null}

      {canUseCloud ? <View style={styles.stack}>
        <View style={styles.taskHeader}><Text style={[styles.heading, { color: colors.foreground }]}>Recent saved source tasks</Text><Text style={[styles.meta, { color: colors.muted }]}>Private to this account</Text></View>
        {taskHistory.isLoading ? <StatePanel loading title="Loading source tasks" message="Reading the private task statuses saved for your account." /> : taskHistory.isError ? <StatePanel icon="error-outline" title="Source task history unavailable" message={taskHistory.error instanceof Error ? taskHistory.error.message : "Check the source task migration and account connection."} actionLabel="Retry" onAction={() => void taskHistory.refetch()} /> : (taskHistory.data ?? []).length ? (taskHistory.data ?? []).filter((record) => record.id !== taskForUser?.id).map((record) => {
          const selected = taskSources(record);
          return <KairosCard key={record.id} style={styles.card}>
            <View style={styles.taskHeader}><KairosBadge label={record.status.replaceAll("_", " ")} tone={record.status === "completed" ? "success" : record.status === "failed" ? "error" : "warning"} /><Text style={[styles.meta, { color: colors.muted }]}>{new Date(record.created_at).toLocaleString()}</Text></View>
            <Text style={[styles.sourceTitle, { color: colors.foreground }]}>{record.goal}</Text>
            <Text style={[styles.smallBody, { color: colors.muted }]}>{selected.length} selected source{selected.length === 1 ? "" : "s"} · {record.scope === "aevum" ? "Aevum" : "Evergreen"}</Text>
            {record.status === "completed" && record.markdown_content ? <>
              <Text style={[styles.smallBody, { color: colors.muted }]}>Read by AI; not independently fact-verified.</Text>
              <Text selectable style={[styles.markdown, { color: colors.foreground }]}>{record.markdown_content}</Text>
              <KairosButton compact tone="secondary" icon="download" label="Download Markdown (.md)" onPress={() => void downloadStoredTask(record, "markdown")} />
              <KairosButton compact tone="secondary" icon="text-snippet" label="Download text (.txt)" onPress={() => void downloadStoredTask(record, "text")} />
            </> : record.status === "failed" ? <>
              <Text style={[styles.smallBody, { color: colors.muted }]}>The failed task is retained without a published brief. You can restore its goal and selected URLs, review them, renew consent, and submit a new task.</Text>
              <KairosButton compact tone="secondary" icon="replay" label="Reuse task inputs" onPress={() => reuseFailedTaskInputs(record)} />
            </> : <View style={styles.statusLine}><ActivityIndicator color={colors.primary} /><Text style={[styles.body, { color: colors.muted }]}>Saved status: {record.status.replaceAll("_", " ")}</Text></View>}
          </KairosCard>;
        }) : <StatePanel icon="description" title="No saved source tasks" message="Completed and failed tasks will appear here and remain private to your signed-in account." />}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { gap: 13 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  subheading: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  body: { fontSize: 13, lineHeight: 19 },
  smallBody: { fontSize: 12, lineHeight: 18 },
  meta: { fontSize: 11, lineHeight: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  consentCard: { gap: 12 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 11 },
  sourceTitle: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  sourceUrl: { fontSize: 11, lineHeight: 16, textDecorationLine: "underline" },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  errorText: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  taskHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  markdown: { fontSize: 13, lineHeight: 20 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  citationRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingVertical: 4 },
  citationNumber: { fontSize: 13, lineHeight: 19, fontWeight: "800" },
});
