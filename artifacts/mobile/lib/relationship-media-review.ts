import type { KairosUser, PartnerConnection } from "@/types/app";
import type { RelationshipMediaItem } from "./relationship-media";

type ReviewUser = Pick<KairosUser, "id" | "isPreview">;
type ReviewConnection = Pick<
  PartnerConnection,
  "id" | "requester_id" | "recipient_id" | "status"
>;
type ReviewItem = Pick<
  RelationshipMediaItem,
  "id" | "user_id" | "kind" | "title" | "updated_at"
>;

export type RelationshipMediaReview = Readonly<{
  id: string;
  kind: RelationshipMediaItem["kind"];
  title: string;
  updated_at: string;
  ownerId: string;
  connectionId: string;
  recipientId: string;
  recipientName: string;
}>;

export type MediaReviewContext = {
  user: ReviewUser | null | undefined;
  connection: ReviewConnection | null | undefined;
  items: readonly ReviewItem[];
  partnerSharingConsent: boolean | undefined;
  permissionsReady: boolean;
};

const connectionChanged =
  "Your accepted partner connection or recipient changed. Nothing was shared. Review the item and recipient again.";
const consentWithdrawn =
  "Partner sharing consent was withdrawn. Nothing was shared. Enable it in Privacy and consent controls, then review again.";

export function acceptedMediaRecipient(
  user: ReviewUser | null | undefined,
  connection: ReviewConnection | null | undefined,
): string | null {
  if (!user || user.isPreview || connection?.status !== "accepted") return null;
  const recipientId =
    connection.requester_id === user.id
      ? connection.recipient_id
      : connection.recipient_id === user.id
        ? connection.requester_id
        : null;
  return recipientId && recipientId !== user.id ? recipientId : null;
}

export function mediaReviewError(
  review: RelationshipMediaReview,
  current: MediaReviewContext,
): string | null {
  if (
    !current.user ||
    current.user.isPreview ||
    current.user.id !== review.ownerId
  )
    return "Your account changed. Nothing was shared. Review again from your current account.";
  if (
    current.connection?.id !== review.connectionId ||
    acceptedMediaRecipient(current.user, current.connection) !==
      review.recipientId
  )
    return connectionChanged;
  if (!current.permissionsReady)
    return "Partner sharing permission could not be checked. Nothing was shared. Retry and review again.";
  // An absent consent can be explicitly granted by this review. An explicit
  // withdrawal must never be silently overwritten by an old acknowledgement.
  if (current.partnerSharingConsent === false) return consentWithdrawn;
  const item = current.items.find((entry) => entry.id === review.id);
  if (
    !item ||
    item.user_id !== review.ownerId ||
    item.updated_at !== review.updated_at
  )
    return "This memory changed since review. Nothing was shared. Review the latest version.";
  return null;
}

export function createRelationshipMediaReview(
  item: ReviewItem,
  current: MediaReviewContext,
  recipientName = "Partner account",
): RelationshipMediaReview {
  const recipientId = acceptedMediaRecipient(current.user, current.connection);
  if (!recipientId || !current.user || !current.connection)
    throw new Error(connectionChanged);
  // Copy only scalar values: query records may change during a pending review.
  const review = Object.freeze({
    id: item.id,
    kind: item.kind,
    title: item.title,
    updated_at: item.updated_at,
    ownerId: current.user.id,
    connectionId: current.connection.id,
    recipientId,
    recipientName: recipientName.trim() || "Partner account",
  });
  const error = mediaReviewError(review, current);
  if (error) throw new Error(error);
  return review;
}

export type ReviewedMediaShareInput = {
  itemId: string;
  connectionId: string;
  updatedAt: string;
};

type ReviewSendDependencies = {
  getCurrent: () => MediaReviewContext;
  refreshCurrent: () => Promise<MediaReviewContext>;
  isReviewAcknowledged: () => boolean;
  saveConsent: () => Promise<unknown>;
  shareMedia: (input: ReviewedMediaShareInput) => Promise<unknown>;
};

/** Validate both refreshed query data and the current account/review after waits. */
export async function sendReviewedRelationshipMedia(
  review: RelationshipMediaReview,
  dependencies: ReviewSendDependencies,
): Promise<void> {
  const validate = (current: MediaReviewContext) => {
    const error = mediaReviewError(review, current);
    if (error) throw new Error(error);
    if (!dependencies.isReviewAcknowledged())
      throw new Error(
        "Review and acknowledge this item and recipient again. Nothing was shared.",
      );
  };

  validate(dependencies.getCurrent());
  let refreshed = await dependencies.refreshCurrent();
  validate(refreshed);
  validate(dependencies.getCurrent());
  if (refreshed.partnerSharingConsent !== true) {
    await dependencies.saveConsent();
    validate(dependencies.getCurrent());
    refreshed = await dependencies.refreshCurrent();
    validate(refreshed);
    validate(dependencies.getCurrent());
  }
  if (refreshed.partnerSharingConsent !== true)
    throw new Error(
      "Current partner sharing consent was not recorded. Nothing was shared.",
    );

  // Never derive the destination from the latest connection at send time.
  // The existing RPC remains responsible for server-side consent/connection checks.
  await dependencies.shareMedia({
    itemId: review.id,
    connectionId: review.connectionId,
    updatedAt: review.updated_at,
  });
}
