import { z } from "zod";

export const MAX_MEMORY_PHOTO_BYTES = 10 * 1024 * 1024;
export const MEMORY_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type RelationshipMediaKind = "song" | "photo";
export type RelationshipMediaProvider =
  | "spotify"
  | "soundcloud"
  | "youtube_music"
  | "device_gallery"
  | "google_photos"
  | "onedrive"
  | "other_link";

export type RelationshipMediaItem = {
  id: string;
  user_id: string;
  kind: RelationshipMediaKind;
  provider: RelationshipMediaProvider;
  title: string;
  note: string;
  external_url: string | null;
  object_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
  updated_at: string;
};

export type RelationshipMediaShare = Omit<
  RelationshipMediaItem,
  "user_id" | "created_at" | "updated_at"
> & {
  item_id: string;
  owner_id: string;
  recipient_id: string;
  connection_id: string;
  shared_at: string;
};

export type MemoryPhotoInput = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

export const songLinkSchema = z.object({
  title: z.string().trim().min(1, "Add a song title.").max(120),
  note: z.string().trim().max(500).default(""),
  url: z
    .string()
    .trim()
    .min(1, "Paste a song link.")
    .max(1000)
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return (
          parsed.protocol === "https:" && !parsed.username && !parsed.password
        );
      } catch {
        return false;
      }
    }, "Use a valid HTTPS link without a username or password."),
});

export type SongLinkInput = z.input<typeof songLinkSchema>;

export function providerForSongUrl(value: string): RelationshipMediaProvider {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "open.spotify.com" || host === "spotify.link")
      return "spotify";
    if (host === "soundcloud.com" || host === "on.soundcloud.com")
      return "soundcloud";
    if (
      host === "music.youtube.com" ||
      host === "youtube.com" ||
      host === "youtu.be"
    )
      return "youtube_music";
  } catch {
    // Invalid links are rejected by songLinkSchema before this helper is used.
  }
  return "other_link";
}

export function validateMemoryPhoto(photo: MemoryPhotoInput) {
  const mime =
    photo.mimeType?.toLowerCase() ??
    (photo.fileName?.toLowerCase().endsWith(".jpg") ? "image/jpeg" : null);
  if (!mime || !(MEMORY_PHOTO_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  }
  if (photo.fileSize != null && photo.fileSize > MAX_MEMORY_PHOTO_BYTES) {
    throw new Error("Memory photos must be 10 MB or smaller.");
  }
  return mime;
}

export function mediaProviderLabel(provider: RelationshipMediaProvider) {
  switch (provider) {
    case "spotify":
      return "Spotify link";
    case "soundcloud":
      return "SoundCloud link";
    case "youtube_music":
      return "YouTube Music link";
    case "device_gallery":
      return "Phone photo";
    case "google_photos":
      return "Google Photos";
    case "onedrive":
      return "Microsoft OneDrive";
    default:
      return "Web link";
  }
}
