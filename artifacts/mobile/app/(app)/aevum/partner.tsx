import { Fonts } from "@/constants/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Platform, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { StatePanel } from "@/components/kairos/state-panel";
import { useColors } from "@/hooks/use-colors";
import { usePartnerConnections, useRequestPartner, useUpdatePartnerConnection } from "@/hooks/use-partner";
import { getAevumErrorMessage } from "@/lib/aevum-errors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

export default function AevumPartnerScreen() {
  const colors = useColors(); const router = useRouter(); const { user } = useKairosAuth(); const { showToast } = useKairosUI();
  const connections = usePartnerConnections(); const request = useRequestPartner(); const update = useUpdatePartnerConnection();
  const [recipient, setRecipient] = useState(""); const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const send = async () => { try { await request.mutateAsync(recipient.trim()); setRecipient(""); showToast("Invitation sent. Your partner must accept before you can share entries.", "success"); } catch (e) { showToast(getAevumErrorMessage(e), "error"); } };
  const transition = async (id: string, status: "accepted" | "rejected" | "disconnected") => { try { await update.mutateAsync({ id, updates: { status } }); setDisconnecting(null); showToast(status === "accepted" ? "Connected. Private answers remain private." : status === "disconnected" ? "Disconnected. Partner access to in-app shared entries has stopped." : "Invitation declined.", "success"); } catch (e) { showToast(getAevumErrorMessage(e), "error"); } };
  const copyId = async () => {
    if (!user || user.isPreview) return; setCopying(true);
    try {
      if (Platform.OS === "web") { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(user.id); }
      else if (!await Clipboard.setStringAsync(user.id)) throw new Error("Copy failed");
      showToast("Account ID copied. Share it with your intended partner so they can invite you.", "success");
    } catch { showToast("Could not copy. Select the account ID and copy manually.", "error"); } finally { setCopying(false); }
  };
  return <ScreenContainer><FlatList data={connections.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} ListHeaderComponent={<KairosCard style={styles.card}>
    <ScreenHeader showBack title="Connect a partner" subtitle="Everyday sharing, by choice" />
    <Text style={[styles.body, { color: colors.muted }]}>An accepted connection lets you share selected journal entries. It never grants access to private drafts or raw assessment answers. Psychological couple-map features remain separate.</Text>
    {user?.isPreview ? <Text style={[styles.body, { color: colors.warning }]}>Preview cannot send or accept real invitations. Sign in with both accounts to connect.</Text> : <><Text style={[styles.heading, { color: colors.foreground }]}>Your Kairos account ID</Text><Text selectable style={[styles.body, { color: colors.foreground }]}>{user?.id}</Text><KairosButton label="Copy my account ID" onPress={() => void copyId()} loading={copying} tone="secondary" /></>}
    <KairosInput label="Partner's Kairos account ID" value={recipient} onChangeText={setRecipient} autoCapitalize="none" placeholder="Ask your partner to copy their account ID" />
    <KairosButton label="Send partner invitation" onPress={() => void send()} loading={request.isPending} disabled={!recipient.trim() || user?.isPreview} />
    <Text style={[styles.body, { color: colors.muted }]}>No entry is shared by sending or accepting an invitation. Review each entry before choosing Share with partner.</Text>
    {connections.isError ? <StatePanel title="Connections could not load" message={getAevumErrorMessage(connections.error)} actionLabel="Try again" onAction={() => void connections.refetch()} /> : null}
    {connections.isLoading ? <StatePanel loading title="Loading connections" message="Checking requests and accepted partners…" /> : null}
  </KairosCard>} renderItem={({ item }) => <KairosCard style={styles.card}>
    <Text style={[styles.heading, { color: colors.foreground }]}>{item.status === "pending" && item.recipient_id === user?.id ? "Incoming invitation" : `Connection: ${item.status}`}</Text>
    <Text selectable style={[styles.body, { color: colors.muted }]}>Partner account: {item.requester_id === user?.id ? item.recipient_id : item.requester_id}</Text>
    {item.status === "pending" && item.recipient_id === user?.id ? <><KairosButton label="Accept invitation" onPress={() => void transition(item.id, "accepted")} loading={update.isPending} /><KairosButton label="Decline invitation" tone="secondary" onPress={() => void transition(item.id, "rejected")} disabled={update.isPending} /></> : null}
    {(item.status === "accepted" || (item.status === "pending" && item.requester_id === user?.id)) ? <>
      {disconnecting === item.id ? <><Text style={[styles.body, { color: colors.warning }]}>Disconnecting removes partner access in Kairos. Copies already sent outside the app cannot be recalled.</Text><KairosButton label="Confirm disconnect" tone="danger" onPress={() => void transition(item.id, "disconnected")} loading={update.isPending} /><KairosButton label="Keep connection" tone="secondary" onPress={() => setDisconnecting(null)} disabled={update.isPending} /></> : <KairosButton label={item.status === "pending" ? "Cancel invitation" : "Disconnect partner"} tone="secondary" onPress={() => setDisconnecting(item.id)} />}
    </> : null}
  </KairosCard>} ListFooterComponent={<KairosButton label="Return to Partner Hub" onPress={() => router.replace("/aevum/life")} tone="secondary" />} /></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 16, paddingBottom: 32 }, card: { gap: 14, marginBottom: 16 }, body: { fontSize: 14, lineHeight: 21 }, heading: { fontSize: 17, lineHeight: 23, fontFamily: Fonts.serif, fontWeight: "400" } });
