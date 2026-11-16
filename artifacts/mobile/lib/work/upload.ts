export type UploadGuard = { assert: () => void; cloud: () => Promise<void> };
/** Transport callbacks are injected so account/cleanup behavior is testable without live requests. */
export async function runWorkUpload({
  guard,
  upload,
  insert,
  cleanup,
}: {
  guard: UploadGuard;
  upload: () => Promise<void>;
  insert: () => Promise<void>;
  cleanup: () => Promise<void>;
}): Promise<void> {
  let uploaded = false,
    inserted = false;
  try {
    await guard.cloud();
    await upload();
    uploaded = true;
    await guard.cloud();
    await insert();
    inserted = true;
    guard.assert();
  } catch (error) {
    if (uploaded && !inserted) {
      try {
        await guard.cloud();
        await cleanup();
      } catch {
        throw new Error(
          "Upload was not saved. Private file cleanup is pending; retry after returning to the original account or ask for owner-scoped storage review.",
        );
      }
    }
    throw error;
  }
}
