import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import {
  useRelationshipMediaPreviewStore,
  type PreviewRelationshipMedia,
} from "@/store/use-relationship-media-preview-store";
import {
  MAX_MEMORY_PHOTO_BYTES,
  validateMemoryPhoto,
  type MemoryPhotoInput,
  type RelationshipMediaItem,
  type RelationshipMediaShare,
  type RelationshipMediaProvider,
} from "@/lib/relationship-media";
import type { TablesInsert } from "@/types/database";

export type RelationshipMediaWithPhoto = RelationshipMediaItem & {
  photo_url: string | null;
  preview_uri?: string | null;
};
export type RelationshipMediaShareWithPhoto = RelationshipMediaShare & {
  photo_url: string | null;
};

type SaveSong = {
  kind: "song";
  provider: RelationshipMediaProvider;
  title: string;
  note: string;
  external_url: string;
};
type SavePhoto = {
  kind: "photo";
  provider: "device_gallery";
  title: string;
  note: string;
  photo: MemoryPhotoInput;
};
export type SaveRelationshipMediaInput = SaveSong | SavePhoto;

const itemsKey = (userId: string) =>
  ["relationship-media-items", userId] as const;
const sharesKey = (userId: string) =>
  ["relationship-media-shares", userId] as const;

async function signPhotoUrls(
  client: NonNullable<ReturnType<typeof getOptionalSupabaseClient>>,
  rows: (RelationshipMediaItem | RelationshipMediaShare)[],
) {
  return Promise.all(
    rows.map(async (row) => {
      const path = row.object_path;
      if (!path) return { ...row, photo_url: null };
      const signed = await client.storage
        .from("relationship-memories")
        .createSignedUrl(path, 5 * 60);
      if (signed.error) throw signed.error;
      return { ...row, photo_url: signed.data.signedUrl };
    }),
  );
}

export function useRelationshipMediaItems() {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: itemsKey(user?.id ?? "anonymous"),
    enabled: Boolean(user),
    meta: { sensitive: true },
    queryFn: async (): Promise<RelationshipMediaWithPhoto[]> => {
      if (!user) return [];
      if (user.isPreview)
        return useRelationshipMediaPreviewStore
          .getState()
          .items.map((item) => ({
            ...item,
            photo_url: item.photo_url,
            preview_uri: item.preview_uri,
          }));
      const client = getOptionalSupabaseClient();
      if (!client)
        throw new Error(
          "Supabase is not configured. Media has not been saved.",
        );
      const result = await client
        .from("relationship_media_items")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return (await signPhotoUrls(
        client,
        result.data,
      )) as RelationshipMediaWithPhoto[];
    },
  });
}

export function useRelationshipMediaShares() {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: sharesKey(user?.id ?? "anonymous"),
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    staleTime: 0,
    refetchInterval: user && !user.isPreview ? 15_000 : false,
    queryFn: async (): Promise<RelationshipMediaShareWithPhoto[]> => {
      if (!user || user.isPreview) return [];
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Supabase is not configured.");
      const result = await client
        .from("relationship_media_shares")
        .select("*")
        .order("shared_at", { ascending: false });
      if (result.error) throw result.error;
      return (await signPhotoUrls(
        client,
        result.data,
      )) as RelationshipMediaShareWithPhoto[];
    },
  });
}

function useInvalidateMedia() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return async () => {
    if (!user) return;
    await queryClient.invalidateQueries({ queryKey: itemsKey(user.id) });
    await queryClient.invalidateQueries({ queryKey: sharesKey(user.id) });
  };
}

export function useSaveRelationshipMedia() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateMedia();
  return useMutation({
    mutationFn: async (
      input: SaveRelationshipMediaInput,
    ): Promise<RelationshipMediaItem> => {
      if (!user)
        throw new Error("Sign in or open preview before saving a memory.");
      const title = input.title.trim();
      const note = input.note.trim();
      if (!title || title.length > 120 || note.length > 500)
        throw new Error(
          "Use a title up to 120 characters and a note up to 500 characters.",
        );
      const now = new Date().toISOString();
      if (input.kind === "song") {
        let parsed: URL;
        try {
          parsed = new URL(input.external_url);
        } catch {
          throw new Error("Use a valid HTTPS song link.");
        }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password)
          throw new Error("Use a valid HTTPS song link without credentials.");
      }
      if (user.isPreview) {
        const id = `preview-media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let row: PreviewRelationshipMedia;
        if (input.kind === "photo") {
          const mime = validateMemoryPhoto(input.photo);
          row = {
            id,
            user_id: user.id,
            kind: "photo",
            provider: "device_gallery",
            title,
            note,
            external_url: null,
            object_path: null,
            mime_type: mime,
            byte_size: input.photo.fileSize ?? null,
            created_at: now,
            updated_at: now,
            preview_uri: input.photo.uri,
            photo_url: input.photo.uri,
          };
        } else {
          row = {
            id,
            user_id: user.id,
            kind: "song",
            provider: input.provider,
            title,
            note,
            external_url: input.external_url,
            object_path: null,
            mime_type: null,
            byte_size: null,
            created_at: now,
            updated_at: now,
            preview_uri: null,
            photo_url: null,
          };
        }
        useRelationshipMediaPreviewStore.getState().saveItem(row);
        return row;
      }
      const client = getOptionalSupabaseClient();
      if (!client)
        throw new Error(
          "Supabase is not configured. Media has not been saved.",
        );
      let objectPath: string | null = null;
      let mimeType: string | null = null;
      let byteSize: number | null = null;
      if (input.kind === "photo") {
        mimeType = validateMemoryPhoto(input.photo);
        const response = await fetch(input.photo.uri);
        if (!response.ok)
          throw new Error("The selected photo could not be read.");
        const blob = await response.blob();
        if (blob.size > MAX_MEMORY_PHOTO_BYTES)
          throw new Error("Memory photos must be 10 MB or smaller.");
        byteSize = blob.size;
        const extension =
          mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
        objectPath = `${user.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
        const upload = await client.storage
          .from("relationship-memories")
          .upload(objectPath, blob, { contentType: mimeType, upsert: false });
        if (upload.error) throw upload.error;
      }
      const insert: TablesInsert<"relationship_media_items"> = {
        user_id: user.id,
        kind: input.kind,
        provider: input.provider,
        title,
        note,
        external_url: input.kind === "song" ? input.external_url : null,
        object_path: objectPath,
        mime_type: mimeType,
        byte_size: byteSize,
      };
      const saved = await client
        .from("relationship_media_items")
        .insert(insert)
        .select("*")
        .single();
      if (saved.error) {
        if (objectPath)
          await client.storage
            .from("relationship-memories")
            .remove([objectPath]);
        throw saved.error;
      }
      return saved.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteRelationshipMedia() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateMedia();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Sign in before removing a memory.");
      if (user.isPreview) {
        useRelationshipMediaPreviewStore.getState().deleteItem(id);
        return;
      }
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Supabase is not configured.");
      const removed = await client
        .from("relationship_media_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("object_path")
        .single();
      if (removed.error) throw removed.error;
      if (removed.data.object_path) {
        const storageResult = await client.storage
          .from("relationship-memories")
          .remove([removed.data.object_path]);
        if (storageResult.error)
          throw new Error(
            "The memory record was removed, but its private photo file could not be deleted. It remains private in your account storage.",
          );
      }
    },
    onSuccess: invalidate,
  });
}

export function useShareRelationshipMedia() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateMedia();
  return useMutation({
    mutationFn: async ({
      itemId,
      connectionId,
      updatedAt,
    }: {
      itemId: string;
      connectionId: string;
      updatedAt: string;
    }) => {
      if (!user || user.isPreview)
        throw new Error(
          "Sign in and connect an accepted partner before in-app sharing.",
        );
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Supabase is not configured.");
      const result = await client.rpc("share_relationship_media", {
        p_item_id: itemId,
        p_connection_id: connectionId,
        p_expected_updated_at: updatedAt,
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: invalidate,
  });
}

export function useRevokeRelationshipMedia() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateMedia();
  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user || user.isPreview)
        throw new Error("Sign in before revoking an in-app share.");
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Supabase is not configured.");
      const result = await client.rpc("revoke_relationship_media", {
        p_item_id: itemId,
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: invalidate,
  });
}
