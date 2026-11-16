import type { Session, User } from "@supabase/supabase-js";

import { parseOAuthCallback } from "./oauth-callback";
import type { RecoveryPasswordWriter } from "./password-recovery-transport";

export const RECOVERY_UI_STORAGE_KEY = "kairos:password-recovery-pending";
export const RECOVERY_RETRY_MESSAGE =
  "This reset session has expired or could not be verified. Request a new reset link and open it on the same device and browser.";

export type RecoveryState = {
  status: "idle" | "verifying" | "ready" | "submitting" | "expired" | "error";
  error: string | null;
  expiresAt: number | null;
};
export const INITIAL_RECOVERY_STATE: RecoveryState = {
  status: "idle", error: null, expiresAt: null,
};

type AuthError = { message?: string; code?: string; status?: number };
type RecoveryAuth = {
  exchangeCodeForSession: (code: string) => Promise<{
    data: { session: Session | null; redirectType?: string | null };
    error: AuthError | null;
  }>;
  getSession: () => Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  getUser: (accessToken: string) => Promise<{ data: { user: User | null }; error: AuthError | null }>;
  signOut: (options: { scope: "local" }) => Promise<{ error: AuthError | null }>;
};

export type CallbackOutcome =
  | "provider_error" | "token_redirect_rejected" | "missing_code"
  | "exchange_failed" | "recovery_unverified";

export class AuthCallbackError extends Error {
  constructor(public outcome: CallbackOutcome, public recovery: boolean, message: string) {
    super(message);
  }
}

export function isRecoveryCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/--\//, "/");
    // Expo development URLs, web URLs and the native auth/callback deep link.
    const callbackPath = path === "/auth/callback" ||
      (parsed.hostname === "auth" && path === "/callback");
    return callbackPath && parsed.searchParams.get("purpose") === "password-recovery";
  } catch {
    return false;
  }
}

export function passwordRecoveryRedirect(callbackUrl: string): string {
  const url = new URL(callbackUrl);
  url.searchParams.set("purpose", "password-recovery");
  return url.toString();
}

export function validateRecoveryPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 72) return "Password must be no more than 72 characters.";
  if (!password.trim()) return "Password cannot contain only spaces.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}

type Proof = { userId: string; accessToken: string; expiresAt: number };
type CallbackResult = { kind: "recovery" | "oauth"; route: "/reset-password" | "/ai" };

/** No URL marker or persisted UI flag ever creates a recovery proof. */
export class PasswordRecoveryController {
  private state = INITIAL_RECOVERY_STATE;
  private proof: Proof | null = null;
  private ownsRecoverySession = false;
  private generation = 0;
  private callbacks = new Map<string, Promise<CallbackResult>>();

  constructor(
    private auth: () => RecoveryAuth,
    private writePassword: RecoveryPasswordWriter,
    private onChange: (state: RecoveryState) => void = () => undefined,
    private now: () => number = Date.now,
  ) {}

  getState(): RecoveryState { return this.state; }

  private change(state: RecoveryState) {
    this.state = state;
    this.onChange(state);
  }

  private invalidate(status: "expired" | "error" = "expired", message = RECOVERY_RETRY_MESSAGE) {
    this.proof = null;
    this.change({ status, error: message, expiresAt: null });
  }

  /** Restoration remembers only that recovery was unfinished, never its authority. */
  restorePendingRecovery() {
    if (this.generation === 0 && this.state.status === "idle") this.invalidate();
  }

  ensureRecoveryScreen() {
    if (this.state.status === "idle") this.invalidate();
    else this.checkExpiry();
  }

  checkExpiry() {
    if (this.proof && this.now() >= this.proof.expiresAt) {
      this.generation += 1;
      this.invalidate();
    }
  }

  private acceptSession(session: Session): boolean {
    if (!session.user?.id || !session.access_token || !session.expires_at) return false;
    const expiresAt = Math.min(session.expires_at * 1000, this.now() + 15 * 60 * 1000);
    if (expiresAt <= this.now()) return false;
    this.proof = { userId: session.user.id, accessToken: session.access_token, expiresAt };
    this.ownsRecoverySession = true;
    this.change({ status: "ready", error: null, expiresAt });
    return true;
  }

  /** Called only with events delivered by the Supabase client, not callback query params. */
  handleAuthEvent(event: string, session: Session | null) {
    if (event === "PASSWORD_RECOVERY") {
      // An event within a PKCE exchange belongs to that verification generation;
      // a fresh recovery event otherwise supersedes any old/in-flight operation.
      if (this.state.status !== "verifying") this.generation += 1;
      if (!session || !this.acceptSession(session)) this.invalidate();
      return;
    }
    if (event === "SIGNED_OUT") {
      this.ownsRecoverySession = false;
      if (this.state.status !== "idle") {
        this.generation += 1;
        this.invalidate();
      }
      return;
    }
    if (!this.proof) return;
    this.checkExpiry();
    if (!this.proof) return;
    if (!session || session.user.id !== this.proof.userId ||
        (event === "SIGNED_IN" && session.access_token !== this.proof.accessToken)) {
      this.generation += 1;
      this.invalidate();
    } else if (event === "TOKEN_REFRESHED") {
      // A real client refresh may rotate the token, but cannot extend recovery's deadline.
      this.proof.accessToken = session.access_token;
    }
  }

  completeCallback(url: string): Promise<CallbackResult> {
    // Linking and the callback screen can receive the same one-time code concurrently.
    let callback;
    try { callback = parseOAuthCallback(url); }
    catch { return this.exchangeCallback(url); }
    if (!callback.code || callback.error || callback.hasTokenFragment) return this.exchangeCallback(url);
    const key = `${isRecoveryCallback(url) ? "recovery" : "oauth"}:${callback.code}`;
    const existing = this.callbacks.get(key);
    if (existing) return existing;
    const result = this.exchangeCallback(url);
    this.callbacks.set(key, result);
    // Keep immediate duplicate results only in short-lived memory, never storage/logs.
    void result.finally(() => setTimeout(() => {
      if (this.callbacks.get(key) === result) this.callbacks.delete(key);
    }, 30000)).catch(() => undefined);
    return result;
  }

  private async exchangeCallback(url: string): Promise<CallbackResult> {
    let recovery = isRecoveryCallback(url);
    const generation = ++this.generation;
    if (recovery) {
      this.proof = null;
      this.change({ status: "verifying", error: null, expiresAt: null });
    }
    const fail = (outcome: CallbackOutcome, message: string): never => {
      if (recovery && generation === this.generation) this.invalidate("error", message);
      throw new AuthCallbackError(outcome, recovery, message);
    };
    let callback;
    try { callback = parseOAuthCallback(url); }
    catch { return fail("missing_code", "This authentication link is invalid. Please try again."); }
    if (callback.hasTokenFragment) {
      return fail("token_redirect_rejected", "Kairos rejected a token-bearing redirect. Request a new link using the secure PKCE flow.");
    }
    if (callback.error) {
      return fail("provider_error", recovery ? RECOVERY_RETRY_MESSAGE : "Sign-in was cancelled or could not be completed. Please try again.");
    }
    if (!callback.code) {
      return fail("missing_code", recovery ? RECOVERY_RETRY_MESSAGE : "The sign-in callback did not include an authorization code.");
    }
    try {
      const result = await this.auth().exchangeCodeForSession(callback.code);
      if (result.error || !result.data.session) {
        return fail("exchange_failed", recovery ? RECOVERY_RETRY_MESSAGE : "The sign-in link expired or could not be exchanged. Please sign in again.");
      }
      const session = result.data.session;
      // Supabase's explicit PKCE exchange emits SIGNED_IN, and reports the recovery
      // purpose from its local PKCE verifier as data.redirectType (not from the URL).
      const genuineRecovery = result.data.redirectType === "recovery" ||
        (this.proof?.userId === session.user.id && this.proof.accessToken === session.access_token);
      if (recovery || genuineRecovery) {
        if (!recovery) {
          recovery = true;
          this.change({ status: "verifying", error: null, expiresAt: null });
        }
        if (!genuineRecovery || generation !== this.generation) {
          return fail("recovery_unverified", RECOVERY_RETRY_MESSAGE);
        }
        const verified = await this.auth().getUser(session.access_token);
        if (verified.error || verified.data.user?.id !== session.user.id ||
            generation !== this.generation || !this.acceptSession(session)) {
          return fail("recovery_unverified", RECOVERY_RETRY_MESSAGE);
        }
        return { kind: "recovery", route: "/reset-password" };
      }
      if (this.state.status !== "idle") {
        return fail("recovery_unverified", "Finish or cancel password recovery before signing in.");
      }
      return { kind: "oauth", route: "/ai" };
    } catch (error) {
      if (error instanceof AuthCallbackError) throw error;
      return fail("exchange_failed", recovery ? RECOVERY_RETRY_MESSAGE : "Sign-in could not finish. Please try again.");
    }
  }

  async submitPassword(password: string, confirmation: string): Promise<void> {
    this.checkExpiry();
    if (this.state.status !== "ready" || !this.proof) {
      if (this.state.status !== "submitting") this.invalidate();
      throw new Error(this.state.error ?? RECOVERY_RETRY_MESSAGE);
    }
    const validation = validateRecoveryPassword(password, confirmation);
    if (validation) throw new Error(validation);
    // TOKEN_REFRESHED may rotate the live proof; never let it mutate an operation's bearer.
    const proof = Object.freeze({ ...this.proof });
    const generation = this.generation;
    this.change({ ...this.state, status: "submitting", error: null });
    try {
      const current = await this.auth().getSession();
      const verified = await this.auth().getUser(proof.accessToken);
      if (current.error || verified.error || !current.data.session ||
          current.data.session.user.id !== proof.userId ||
          current.data.session.access_token !== proof.accessToken ||
          this.proof?.accessToken !== proof.accessToken ||
          verified.data.user?.id !== proof.userId || generation !== this.generation ||
          this.now() >= proof.expiresAt ||
          (current.data.session.expires_at ?? 0) * 1000 <= this.now()) {
        if (generation === this.generation) this.invalidate();
        throw new Error(RECOVERY_RETRY_MESSAGE);
      }
      // No shared auth.updateUser: it awaits an SDK lock and rereads mutable storage.
      // Once this request is dispatched, cancellation cannot undo a server write;
      // the frozen bearer limits it to this verified account, never a switched one.
      const result = await this.writePassword(proof, { password });
      if (generation !== this.generation) throw new Error(RECOVERY_RETRY_MESSAGE);
      if (result.error) {
        if (result.error.status === 401 || result.error.status === 403 ||
            ["session_not_found", "refresh_token_not_found", "refresh_token_already_used", "recovery_user_mismatch"].includes(result.error.code ?? "")) {
          this.invalidate();
          throw new Error(RECOVERY_RETRY_MESSAGE);
        }
        const message = result.error.code === "weak_password" ? "Choose a stronger password and try again." :
          result.error.code === "same_password" ? "Choose a password different from your current password." :
          "Password could not be updated. Please try again.";
        throw new Error(message);
      }
      if (result.data.user?.id !== proof.userId || this.proof?.userId !== proof.userId ||
          this.now() >= proof.expiresAt) {
        this.invalidate();
        throw new Error(RECOVERY_RETRY_MESSAGE);
      }
      this.proof = null;
      this.ownsRecoverySession = false;
      this.change(INITIAL_RECOVERY_STATE);
    } catch (error) {
      const message = error instanceof Error && [RECOVERY_RETRY_MESSAGE,
        "Choose a stronger password and try again.",
        "Choose a password different from your current password.",
        "Password could not be updated. Please try again."].includes(error.message)
        ? error.message : "Password could not be updated. Please try again.";
      if (generation === this.generation && this.getState().status === "submitting") {
        this.change({ status: "ready", error: message, expiresAt: proof.expiresAt });
        this.checkExpiry();
      }
      throw new Error(this.state.error ?? message);
    }
  }

  async cancel(): Promise<void> {
    this.generation += 1;
    if (this.ownsRecoverySession || this.state.status !== "idle") {
      // A restored UI lock cannot prove which kind of session was persisted. On an
      // explicit cancellation, close it locally rather than unlock a recovery login.
      let auth: RecoveryAuth | null = null;
      try { auth = this.auth(); }
      catch {
        if (this.ownsRecoverySession) throw new Error("Could not close the reset session. Please try again.");
      }
      if (auth) {
        try {
          const result = await auth.signOut({ scope: "local" });
          if (result.error) throw new Error("sign-out failed");
        } catch { throw new Error("Could not close the reset session. Please try again."); }
      }
    }
    this.proof = null;
    this.ownsRecoverySession = false;
    this.callbacks.clear();
    this.change(INITIAL_RECOVERY_STATE);
  }
}
