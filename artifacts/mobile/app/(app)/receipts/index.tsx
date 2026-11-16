import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, FlatList, Image, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useCreateWorkExpense, useDeleteWorkExpense, useWorkExpenses } from "@/hooks/use-work-expenses";
import { MAX_RECEIPT_FILE_BYTES, validateReceiptAttachment, workExpenseSchema } from "@/lib/work-expenses";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { useWorkExpensePreviewStore, type PreviewWorkExpense } from "@/store/use-work-expense-preview-store";
import type { WorkExpenseWithReceipt } from "@/hooks/use-work-expenses";

type ReceiptPhoto = { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null };
type ReceiptListItem = WorkExpenseWithReceipt | PreviewWorkExpense;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ReceiptsScreen() {
  const colors = useColors();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const expensesQuery = useWorkExpenses();
  const createExpense = useCreateWorkExpense();
  const deleteExpense = useDeleteWorkExpense();
  const isPreview = Boolean(user?.isPreview);
  const previewExpenses = useWorkExpensePreviewStore((state) => state.expenses);
  const addPreviewExpense = useWorkExpensePreviewStore((state) => state.addExpense);
  const deletePreviewExpense = useWorkExpensePreviewStore((state) => state.deleteExpense);
  const expenses: ReceiptListItem[] = isPreview ? previewExpenses : expensesQuery.data ?? [];

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [expenseDate, setExpenseDate] = useState(localDate);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const choosePhoto = async (source: "camera" | "library") => {
    setFormError(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Allow camera access to take a receipt photo.");
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Allow photo-library access to choose a receipt.");
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const selected = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize };
      validateReceiptAttachment(selected);
      setPhoto(selected);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The receipt photo could not be selected.");
    }
  };

  const clearForm = () => {
    setMerchant("");
    setAmount("");
    setCurrency("AUD");
    setExpenseDate(localDate());
    setNotes("");
    setPhoto(null);
    setFormError(null);
  };

  const saveExpense = async () => {
    setFormError(null);
    const parsed = workExpenseSchema.safeParse({ merchant, amount, currency, expense_date: expenseDate, notes });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the receipt details and try again.");
      return;
    }
    try {
      const receiptMimeType = photo ? validateReceiptAttachment(photo) : null;
      if (photo && photo.fileSize != null && photo.fileSize > MAX_RECEIPT_FILE_BYTES) throw new Error("Receipt photos must be 5 MB or smaller.");
      if (isPreview) {
        if (!user) throw new Error("Preview user is not available.");
        const record: PreviewWorkExpense = {
          id: `preview-${Date.now()}`,
          user_id: user.id,
          merchant: parsed.data.merchant,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          expense_date: parsed.data.expense_date,
          notes: parsed.data.notes,
          attachment_path: null,
          attachment_mime_type: receiptMimeType,
          attachment_bytes: photo?.fileSize ?? null,
          created_at: new Date().toISOString(),
          previewUri: photo?.uri ?? null,
        };
        addPreviewExpense(record);
        showToast("Saved in this preview session only.", "success");
      } else {
        await createExpense.mutateAsync({ form: parsed.data, receipt: photo });
        showToast("Receipt and expense saved privately.", "success");
      }
      clearForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The receipt could not be saved.");
    }
  };

  const removeExpense = (item: ReceiptListItem) => {
    const runDelete = async () => {
      try {
        if (isPreview) {
          deletePreviewExpense(item.id);
          showToast("Preview receipt removed.", "success");
        } else {
          const result = await deleteExpense.mutateAsync(item.id);
          showToast(result.photoCleanupPending ? "Expense removed; photo cleanup failed and the photo remains private to your account." : "Receipt and expense removed.", result.photoCleanupPending ? "error" : "success");
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "The receipt could not be removed.", "error");
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Remove this receipt and expense? This cannot be undone.")) void runDelete();
    } else {
      Alert.alert("Remove receipt?", "This deletes the expense record and its photo from your private archive.", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void runDelete() },
      ]);
    }
  };

  const renderExpense = ({ item }: { item: ReceiptListItem }) => {
    const imageUri = "previewUri" in item ? item.previewUri : item.receiptUrl;
    return (
      <KairosCard style={styles.expenseCard}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumbnail} accessibilityLabel={`Receipt photo for ${item.merchant}`} /> : (
          <View style={[styles.thumbnail, styles.emptyThumbnail, { backgroundColor: `${colors.primary}18` }]}>
            <MaterialIcons name="receipt-long" color={colors.primary} size={26} />
          </View>
        )}
        <View style={styles.expenseDetails}>
          <Text style={[styles.merchant, { color: colors.foreground }]} numberOfLines={1}>{item.merchant}</Text>
          <Text style={[styles.amountText, { color: colors.primary }]}>{item.currency} {Number(item.amount).toFixed(2)}</Text>
          <Text style={[styles.metadata, { color: colors.muted }]}>{item.expense_date}{item.attachment_path || ("previewUri" in item && item.previewUri) ? " · receipt photo" : ""}</Text>
          {item.notes ? <Text style={[styles.noteText, { color: colors.muted }]} numberOfLines={2}>{item.notes}</Text> : null}
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel={`Remove ${item.merchant} receipt`} onPress={() => removeExpense(item)} style={styles.removeButton}>
          <MaterialIcons name="delete-outline" size={21} color={colors.error} />
        </PressableScale>
      </KairosCard>
    );
  };

  const formHeader = (
    <View style={styles.content}>
      <ScreenHeader showBack title="Receipts & expenses" subtitle="Keep work purchases and receipt photos together." />
      <KairosCard style={styles.privacyCard}>
        <MaterialIcons name="lock-outline" size={21} color={colors.primary} />
        <Text style={[styles.privacyText, { color: colors.muted }]}>
          {isPreview ? "Preview only: records and selected photos stay in memory for this app session and are cleared when you leave preview or change accounts." : "Private to your account. Photos use private storage and short-lived signed links; relationship sharing is not enabled."}
        </Text>
      </KairosCard>
      <KairosCard style={styles.formCard}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Add a receipt</Text>
        <Text style={[styles.helper, { color: colors.muted }]}>Enter the details yourself. This version does not use OCR or auto-read your receipt.</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Merchant</Text>
        <TextInput value={merchant} onChangeText={setMerchant} placeholder="e.g. Stationery shop" placeholderTextColor={colors.muted} maxLength={120} accessibilityLabel="Merchant" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={[styles.label, { color: colors.foreground }]}>Amount</Text>
            <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.muted} keyboardType="decimal-pad" accessibilityLabel="Amount" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={[styles.label, { color: colors.foreground }]}>Currency</Text>
            <TextInput value={currency} onChangeText={(value) => setCurrency(value.toUpperCase())} maxLength={3} autoCapitalize="characters" placeholder="AUD" placeholderTextColor={colors.muted} accessibilityLabel="Currency code" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
          </View>
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>Date (YYYY-MM-DD)</Text>
        <TextInput value={expenseDate} onChangeText={setExpenseDate} placeholder="2026-11-15" placeholderTextColor={colors.muted} accessibilityLabel="Expense date" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Notes (optional)</Text>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Project, docket number, or context" placeholderTextColor={colors.muted} maxLength={2000} multiline accessibilityLabel="Expense notes" style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
        <View style={styles.photoActions}>
          <KairosButton label={photo ? "Change photo" : "Choose photo"} icon="photo-library" tone="secondary" onPress={() => void choosePhoto("library")} style={styles.photoButton} />
          <KairosButton label="Take photo" icon="photo-camera" tone="secondary" disabled={Platform.OS === "web"} onPress={() => void choosePhoto("camera")} style={styles.photoButton} />
        </View>
        {photo ? (
          <View style={styles.selectedPhotoRow}>
            <Image source={{ uri: photo.uri }} style={styles.selectedPhoto} accessibilityLabel="Selected receipt photo preview" />
            <View style={styles.selectedPhotoInfo}>
              <Text style={[styles.photoName, { color: colors.foreground }]} numberOfLines={2}>{photo.fileName ?? "Receipt photo selected"}</Text>
              <Text style={[styles.helper, { color: colors.muted }]}>JPEG, PNG, or WebP · max 5 MB</Text>
              <PressableScale accessibilityRole="button" accessibilityLabel="Remove selected receipt photo" onPress={() => setPhoto(null)} style={styles.clearPhoto}>
                <Text style={{ color: colors.error, fontWeight: "700" }}>Remove photo</Text>
              </PressableScale>
            </View>
          </View>
        ) : null}
        {formError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.error }]}>{formError}</Text> : null}
        <KairosButton label="Save receipt" icon="save" onPress={() => void saveExpense()} loading={createExpense.isPending} />
      </KairosCard>
      <View style={styles.archiveHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your archive</Text>
        <Text style={[styles.helper, { color: colors.muted }]}>{expenses.length} {expenses.length === 1 ? "record" : "records"}</Text>
      </View>
      {!isPreview && expensesQuery.isLoading ? <Text style={[styles.helper, { color: colors.muted }]}>Loading private receipts…</Text> : null}
      {!isPreview && expensesQuery.error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.error }]}>{expensesQuery.error.message}</Text> : null}
    </View>
  );

  return (
    <ScreenContainer>
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderExpense}
        ListHeaderComponent={formHeader}
        ListEmptyComponent={!expensesQuery.isLoading ? <Text style={[styles.emptyText, { color: colors.muted }]}>No receipts yet. Add a work purchase above to start your private archive.</Text> : undefined}
        contentContainerStyle={styles.listContent}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 120 },
  content: { padding: 16, gap: 14 },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19 },
  formCard: { gap: 11 },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "800" },
  helper: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldHalf: { flex: 1, gap: 7 },
  photoActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  photoButton: { flex: 1 },
  selectedPhotoRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 4 },
  selectedPhoto: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#123" },
  selectedPhotoInfo: { flex: 1, gap: 4 },
  photoName: { fontWeight: "700", fontSize: 13 },
  clearPhoto: { alignSelf: "flex-start", paddingVertical: 5 },
  errorText: { fontSize: 13, lineHeight: 18 },
  archiveHeader: { paddingHorizontal: 16, paddingTop: 4, gap: 2 },
  emptyText: { marginHorizontal: 16, marginTop: 10, padding: 16, textAlign: "center", lineHeight: 20 },
  expenseCard: { marginHorizontal: 16, marginBottom: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  thumbnail: { width: 56, height: 56, borderRadius: 12 },
  emptyThumbnail: { alignItems: "center", justifyContent: "center" },
  expenseDetails: { flex: 1, gap: 3 },
  merchant: { fontSize: 15, fontWeight: "800" },
  amountText: { fontSize: 14, fontWeight: "800" },
  metadata: { fontSize: 11 },
  noteText: { fontSize: 12, lineHeight: 17 },
  removeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
