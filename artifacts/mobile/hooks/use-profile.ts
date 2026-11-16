import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys } from "@/types/app";
import type { TablesUpdate } from "@/types/database";

export function useAvatarUrl(path: string | null | undefined) {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: ["avatar", user?.id, path],
    enabled: Boolean(user && !user.isPreview && path),
    queryFn: async () => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase || !path) return null;
      const result = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    },
    staleTime: 50 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const { user, refreshProfile } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: TablesUpdate<"profiles">) => {
      if (!user) throw new Error("Sign in to update your profile.");
      if (user.isPreview) throw new Error("Connect Supabase to save profile changes from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("profiles").update(updates).eq("id", user.id).select("*").single();
      if (result.error) throw result.error;
      if (updates.full_name !== undefined) {
        const authResult = await supabase.auth.updateUser({ data: { full_name: updates.full_name } });
        if (authResult.error) throw authResult.error;
      }
      return result.data;
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: queryKeys.profile(user.id) });
      await refreshProfile();
    },
  });
}

export function useUploadAvatar() {
  const { user, profile, refreshProfile } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType?: string | null }) => {
      if (!user) throw new Error("Sign in to upload an avatar.");
      if (user.isPreview) throw new Error("Connect Supabase to upload an avatar from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const extension = mimeType?.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${extension}`;
      const response = await fetch(uri);
      if (!response.ok) throw new Error("The selected image could not be read.");
      const blob = await response.blob();
      const upload = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: mimeType ?? "image/jpeg",
        upsert: false,
      });
      if (upload.error) throw upload.error;
      const update = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
      if (update.error) {
        await supabase.storage.from("avatars").remove([path]);
        throw update.error;
      }
      if (profile?.avatar_url && profile.avatar_url.startsWith(`${user.id}/`)) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]);
      }
      return path;
    },
    onSuccess: async () => {
      if (user) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.profile(user.id) });
        await queryClient.invalidateQueries({ queryKey: ["avatar", user.id] });
      }
      await refreshProfile();
    },
  });
}
