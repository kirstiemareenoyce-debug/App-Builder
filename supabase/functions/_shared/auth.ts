import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.57.4";
import { HttpError } from "./errors.ts";
import { createUserClient } from "./supabase.ts";

export interface AuthenticatedRequest {
  accessToken: string;
  user: User;
  userClient: SupabaseClient;
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new HttpError(401, "AUTH_REQUIRED", "A valid bearer token is required.");
  const accessToken = match[1];
  const userClient = createUserClient(accessToken);
  // The platform JWT check is enabled as well. getUser establishes the actual
  // account and rejects API keys, expired sessions and deleted users.
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new HttpError(401, "AUTH_REQUIRED", "The session is invalid or has expired.");
  }
  return { accessToken, user: data.user, userClient };
}
