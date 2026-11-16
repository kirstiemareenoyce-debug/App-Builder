import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { z } from "zod";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useAvatarUrl, useUpdateProfile, useUploadAvatar } from "@/hooks/use-profile";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

const profileSchema = z.object({ fullName: z.string().trim().min(1, "Name is required.").max(100) });

export default function ProfileScreen() {
  const colors = useColors();
  const { user, profile } = useKairosAuth();
  const { showToast } = useKairosUI();
  const avatar = useAvatarUrl(profile?.avatar_url);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const [fullName, setFullName] = useState(profile?.full_name ?? user?.fullName ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setFullName(profile?.full_name ?? user?.fullName ?? ""), [profile?.full_name, user?.fullName]);

  const chooseAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Photo-library permission is required to choose an avatar.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      await uploadAvatar.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType });
      showToast("Profile photo updated.", "success");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Profile photo could not be updated.");
    }
  };

  const save = async () => {
    const parsed = profileSchema.safeParse({ fullName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your name.");
      return;
    }
    try {
      setError(null);
      await updateProfile.mutateAsync({ full_name: parsed.data.fullName });
      showToast("Profile saved.", "success");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile could not be saved.");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title="Profile" subtitle="How you appear in Kairos" />
        <KairosCard style={styles.form}>
          <View style={styles.avatarArea}>
            <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {avatar.data ? <Image accessibilityLabel="Profile avatar" source={{ uri: avatar.data }} style={styles.avatarImage} /> : <Text style={[styles.initials, { color: colors.primary }]}>{(fullName || "K").slice(0, 1).toUpperCase()}</Text>}
            </View>
            <KairosButton compact icon="photo-library" label="Choose Photo" loading={uploadAvatar.isPending} tone="secondary" onPress={() => void chooseAvatar()} />
          </View>
          <KairosInput label="Full name" maxLength={100} onChangeText={setFullName} value={fullName} />
          <KairosInput editable={false} label="Email" value={user?.email ?? "Unavailable"} />
          {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <KairosButton label="Save Profile" loading={updateProfile.isPending} onPress={() => void save()} />
        </KairosCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  form: { gap: 18 },
  avatarArea: { alignItems: "center", gap: 12 },
  avatar: { width: 108, height: 108, borderRadius: 54, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 108, height: 108 },
  initials: { fontSize: 40, lineHeight: 48, fontWeight: "900" },
  error: { fontSize: 13, lineHeight: 18 },
});
