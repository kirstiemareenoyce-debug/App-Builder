import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Validate the initiating owner, then pin Authorization on the SDK request itself.
 * The SDK's fetchWithAuth preserves an explicit header even if its shared auth
 * client switches accounts while the request is being dispatched. The bearer
 * exists only in this short-lived closure/request, never mutation state or keys.
 */
export async function getPinnedUserRequest(client: SupabaseClient<Database>, expectedOwner: string) {
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  if (error || !expectedOwner || !session || session.user.id !== expectedOwner || !session.access_token) {
    throw new Error("Your account changed or your session expired. Sign in before saving.");
  }
  const authorization = `Bearer ${session.access_token}`;
  return <Request extends { setHeader(name: string, value: string): Request }>(request: Request): Request =>
    request.setHeader("Authorization", authorization);
}
