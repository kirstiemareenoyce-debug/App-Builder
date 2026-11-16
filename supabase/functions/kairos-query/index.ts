import { authenticateRequest } from "../_shared/auth.ts";
import { completeEvergreen } from "../_shared/ai-provider.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { handleKairosQuery } from "./handler.ts";

Deno.serve((request: Request) => handleKairosQuery(request, {
  authenticate: authenticateRequest,
  complete: completeEvergreen,
  serviceClient: createServiceClient,
}));
