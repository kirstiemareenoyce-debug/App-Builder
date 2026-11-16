import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  configureSupabaseLifecycle,
  getOptionalSupabaseClient,
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { requirePkceCode } from "@/lib/oauth-callback";
import { signOutWithChatDraftCleanup } from "@/lib/chat-draft-cleanup";
import {
  INITIAL_RECOVERY_STATE,
  PasswordRecoveryController,
  RECOVERY_UI_STORAGE_KEY,
  isRecoveryCallback,
  passwordRecoveryRedirect,
  type RecoveryState,
} from "@/lib/password-recovery";
import { createRecoveryPasswordTransport } from "@/lib/password-recovery-transport";
import { PREVIEW_CHAT_DRAFT_OWNER, useAppStore } from "@/store/use-app-store";
import { useAevumPreviewStore } from "@/store/use-aevum-preview-store";
import { useWorkExpensePreviewStore } from "@/store/use-work-expense-preview-store";
import { resetWorkPreview } from "@/store/use-work-preview-store";
import { useRelationshipMediaPreviewStore } from "@/store/use-relationship-media-preview-store";
import type { KairosUser, Profile } from "@/types/app";

import { bindIndividualIntakeIdentity, intakeIdentityKey } from "@/lib/individual-intake/client-state";
import { bindIndividualIntakePreviewIdentity, resetIndividualIntakePreview } from "@/store/use-individual-intake-preview-store";

type OAuthProvider = "google" | "apple";
const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000001";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: KairosUser | null;
  profile: Profile | null;
  error: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  recovery: RecoveryState;
  completeAuthCallback: (url: string) => Promise<{ kind: "recovery" | "oauth"; route: "/reset-password" | "/ai" }>;
  updateRecoveryPassword: (password: string, confirmation: string) => Promise<void>;
  ensureRecoverySession: () => void;
  cancelPasswordRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  enterPreviewMode: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toKairosUser(user: User, profile: Profile | null): KairosUser {
  return {
    id: user.id,
    email: user.email ?? null,
    fullName:
      profile?.full_name ??
      (user.user_metadata.full_name as string | undefined) ??
      null,
    isPreview: false,
    raw: user,
  };
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const queryClient = useQueryClient();
  const previewMode = useAppStore((state) => state.previewMode);
  const setPreviewMode = useAppStore((state) => state.setPreviewMode);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(INITIAL_RECOVERY_STATE);
  const [recoveryRestored, setRecoveryRestored] = useState(false);
  const mountedLifetime = useRef<object | null>(null);
  const authLifecycle = useRef<object | null>(null);
  const authRevision = useRef(0);
  const sessionOwner = useRef<string | null>(null);
  const profileRequest = useRef(0);
  useLayoutEffect(() => {
    const lifetime = {};
    mountedLifetime.current = lifetime;
    return () => {
      if (mountedLifetime.current === lifetime) {
        mountedLifetime.current = null;
        authLifecycle.current = null;
        // This is a monotonic generation, not a node ref: invalidate the latest value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        authRevision.current++;
        sessionOwner.current = null;
      }
    };
  }, []);
  const clearSessionState = useCallback(() => {
    authRevision.current++;
    sessionOwner.current = null;
    useAppStore.getState().bindChatDraftOwner(null);
    bindIndividualIntakeIdentity(null, false);
    bindIndividualIntakePreviewIdentity(null);
    if (!mountedLifetime.current) return;
    setSession(null);
    setProfile(null);
  }, []);
  const recoveryStorageQueue = useRef(Promise.resolve());
  const [recoveryController] = useState(() => new PasswordRecoveryController(
    () => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      return supabase.auth;
    },
    (target, attributes) => {
      const config = getSupabasePublicConfig();
      if (!config.url) throw new Error("Supabase configuration is unavailable.");
      return createRecoveryPasswordTransport({
        url: config.url,
        anonKey: config.anonKey,
      })(target, attributes);
    },
    (next) => {
      if (mountedLifetime.current) setRecovery(next);
      // Persist only a UI lock. Never persist a proof, session, code or password here.
      recoveryStorageQueue.current = recoveryStorageQueue.current.then(() =>
        next.status === "idle"
          ? AsyncStorage.removeItem(RECOVERY_UI_STORAGE_KEY)
          : AsyncStorage.setItem(RECOVERY_UI_STORAGE_KEY, "pending"),
      ).catch(() => undefined);
    },
  ));
  const completeAuthCallback = useCallback(async (url: string) => {
    const result = await recoveryController.completeCallback(url);
    setPreviewMode(false);
    return { ...result, route: result.kind === "oauth" ? "/ai" as const : "/reset-password" as const };
  }, [recoveryController, setPreviewMode]);
  const updateRecoveryPassword = useCallback(
    async (password: string, confirmation: string) => {
      await recoveryController.submitPassword(password, confirmation);
      await recoveryStorageQueue.current;
    },
    [recoveryController],
  );
  const ensureRecoverySession = useCallback(() => recoveryController.ensureRecoveryScreen(), [recoveryController]);
  const cancelPasswordRecovery = useCallback(async () => {
    const recoveryWasActive = recoveryController.getState().status !== "idle";
    await recoveryController.cancel();
    if (recoveryWasActive) {
      // Recovery cancellation signs out locally; keep the other approved draft
      // cleanup intact without changing the normal signOut callback.
      useAppStore.getState().clearChatDraft();
      clearSessionState();
      setPreviewMode(false);
    }
    await recoveryStorageQueue.current;
  }, [clearSessionState, recoveryController, setPreviewMode]);

  useEffect(() => {
    let active = true;
    const receive = (url: string | null) => {
      if (active && url && isRecoveryCallback(url)) {
        void completeAuthCallback(url).catch(() => undefined);
      }
    };
    const subscription = Linking.addEventListener("url", ({ url }) => receive(url));
    void Promise.all([
      AsyncStorage.getItem(RECOVERY_UI_STORAGE_KEY).catch(() => null),
      Linking.getInitialURL().catch(() => null),
    ]).then(([pending, url]) => {
      if (!active) return;
      if (pending === "pending") recoveryController.restorePendingRecovery();
      receive(url);
    }).catch(() => undefined).finally(() => {
      if (active) setRecoveryRestored(true);
    });
    return () => { active = false; subscription.remove(); };
  }, [completeAuthCallback, recoveryController]);

  useEffect(() => {
    if (!recovery.expiresAt) return;
    const timer = setTimeout(() => recoveryController.checkExpiry(), Math.max(0, recovery.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [recovery.expiresAt, recoveryController]);

  useEffect(() => {
    // Remove the previous persistence generation, which could include relationship data.
    void AsyncStorage.removeItem("kairos-react-query-v1").catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    useAevumPreviewStore.getState().reset();
    useWorkExpensePreviewStore.getState().reset();
    useRelationshipMediaPreviewStore.getState().reset();
    resetWorkPreview();
    const intakeOwner = previewMode ? PREVIEW_USER_ID : session?.user.id ?? null;
    bindIndividualIntakeIdentity(intakeOwner, previewMode);
    bindIndividualIntakePreviewIdentity(intakeOwner ? intakeIdentityKey(intakeOwner, previewMode) : null);
    // Mutation variables can contain private text or local file references.
    // Clear them across identities; captured operations keep their own guards.
    queryClient.getMutationCache().clear();
    queryClient.removeQueries({
      predicate: (query) => {
        const key = String(query.queryKey[0] ?? "");
        return (
          Boolean(query.meta?.sensitive) ||
          key.startsWith("aevum") ||
          key === "partner" ||
          key.startsWith("work-") ||
          key.startsWith("kairos-") ||
          key.startsWith("individual-intake") ||
          key.startsWith("agent-")
        );
      },
    });
  }, [previewMode, session?.user.id, queryClient]);

  const loadProfile = useCallback(async (userId: string) => {
    const lifetime = mountedLifetime.current;
    const lifecycle = authLifecycle.current;
    const revision = authRevision.current;
    if (!lifetime || !lifecycle || sessionOwner.current !== userId || useAppStore.getState().previewMode) return;
    const request = ++profileRequest.current;
    const isCurrent = () => Boolean(lifetime && lifecycle) &&
      mountedLifetime.current === lifetime && authLifecycle.current === lifecycle &&
      authRevision.current === revision && sessionOwner.current === userId &&
      profileRequest.current === request && !useAppStore.getState().previewMode;
    if (!isCurrent()) return;
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return;
    try {
      const result = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!isCurrent()) return;
      if (result.error) throw result.error;
      setProfile(result.data?.id === userId ? result.data : null);
    } catch (profileError) {
      if (!isCurrent()) return;
      setError("Profile could not be loaded.");
      throw profileError;
    }
  }, []);

  useEffect(() => {
    if (previewMode || !configured) {
      authLifecycle.current = null;
      authRevision.current++;
      sessionOwner.current = null;
      setSession(null);
      setProfile(null);
      useAppStore.getState().bindChatDraftOwner(previewMode ? PREVIEW_CHAT_DRAFT_OWNER : null);
      setLoading(false);
      return;
    }
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    const stopLifecycle = configureSupabaseLifecycle();
    const lifetime = mountedLifetime.current;
    const lifecycle = {};
    authLifecycle.current = lifecycle;
    const isCurrent = () => Boolean(lifetime) && mountedLifetime.current === lifetime &&
      authLifecycle.current === lifecycle && !useAppStore.getState().previewMode;
    const acceptSession = (nextSession: Session | null) => {
      const nextOwner = nextSession?.user.id ?? null;
      if (sessionOwner.current !== nextOwner) setProfile(null);
      sessionOwner.current = nextOwner;
      authRevision.current++;
      // Confirm and purge drafts before descendants render the next identity.
      useAppStore.getState().bindChatDraftOwner(nextOwner ? `${nextOwner}:cloud` : null);
      bindIndividualIntakeIdentity(nextOwner, false);
      bindIndividualIntakePreviewIdentity(nextOwner ? intakeIdentityKey(nextOwner, false) : null);
      setSession(nextSession);
    };
    // Subscribe before starting bootstrap; a newer auth event always wins.
    const bootstrapRevision = authRevision.current;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isCurrent()) return;
        recoveryController.handleAuthEvent(event, nextSession);
        acceptSession(nextSession);
        setError(null);
        setLoading(false);
        if (nextSession?.user) void loadProfile(nextSession.user.id).catch(() => undefined);
      },
    );

    void supabase.auth
      .getSession()
      .then(async ({ data, error: sessionError }) => {
        if (!isCurrent() || authRevision.current !== bootstrapRevision) return;
        if (sessionError) setError(sessionError.message);
        acceptSession(data.session);
        const acceptedRevision = authRevision.current;
        if (data.session?.user) {
          await loadProfile(data.session.user.id).catch(() => undefined);
        }
        if (isCurrent() && authRevision.current === acceptedRevision) setLoading(false);
      })
      .catch(() => {
        if (!isCurrent() || authRevision.current !== bootstrapRevision) return;
        setError(
          "Your session could not be restored. Sign in again or open preview mode.",
        );
        setLoading(false);
      });

    return () => {
      if (authLifecycle.current === lifecycle) {
        authLifecycle.current = null;
        // Retire all requests started by this lifecycle, including its latest refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        authRevision.current++;
      }
      stopLifecycle();
      listener.subscription.unsubscribe();
    };
  }, [configured, loadProfile, previewMode, recoveryController]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase)
        throw new Error("Supabase configuration is required to sign in.");
      setError(null);
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (result.error) throw result.error;
      setPreviewMode(false);
    },
    [setPreviewMode],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string, fullName: string) => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase)
        throw new Error(
          "Supabase configuration is required to create an account.",
        );
      setError(null);
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (result.error) throw result.error;
      setPreviewMode(false);
    },
    [setPreviewMode],
  );

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider) => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase)
        throw new Error(
          "Supabase configuration is required for social sign-in.",
        );
      setError(null);
      const redirectTo = Linking.createURL("auth/callback");
      const result = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (result.error) throw result.error;
      if (!result.data.url) {
        throw new Error(
          "The sign-in provider did not return an authorization URL.",
        );
      }

      const browserResult = await WebBrowser.openAuthSessionAsync(
        result.data.url,
        redirectTo,
      );
      if (browserResult.type !== "success") return false;
      const code = requirePkceCode(browserResult.url);
      const current = await supabase.auth.getSession();
      if (current.error) throw current.error;
      if (current.data.session) {
        setPreviewMode(false);
        return true;
      }
      const exchange = await supabase.auth.exchangeCodeForSession(code);
      if (exchange.error) throw exchange.error;
      setPreviewMode(false);
      return true;
    },
    [setPreviewMode],
  );

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase)
      throw new Error(
        "Supabase configuration is required to reset a password.",
      );
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordRecoveryRedirect(Linking.createURL("auth/callback")),
    });
    if (result.error) throw result.error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getOptionalSupabaseClient();
    let remoteSignOut: (() => Promise<{ error: unknown }>) | null = null;
    if (!previewMode && supabase && session) {
      remoteSignOut = () => supabase.auth.signOut();
    }
    await signOutWithChatDraftCleanup({
      previewMode,
      hasSession: Boolean(session),
      remoteSignOut,
      onSignedOut: () => {
        useAevumPreviewStore.getState().reset();
        useRelationshipMediaPreviewStore.getState().reset();
        useWorkExpensePreviewStore.getState().reset();
        resetWorkPreview();
        resetIndividualIntakePreview();
        queryClient.getMutationCache().clear();
        setPreviewMode(false);
        clearSessionState();
      },
    });
  }, [clearSessionState, previewMode, session, setPreviewMode, queryClient]);

  const refreshProfile = useCallback(async () => {
    if (!previewMode && session?.user) await loadProfile(session.user.id);
  }, [loadProfile, session, previewMode]);

  // Also mask at render time: no pending effect or stale state can decorate B
  // with A's profile, including the user.fullName derivation.
  const ownedProfile = session?.user.id && profile?.id === session.user.id ? profile : null;
  const user = useMemo<KairosUser | null>(() => {
    if (!recoveryRestored || recovery.status !== "idle") return null;
    if (!previewMode)
      return session?.user ? toKairosUser(session.user, ownedProfile) : null;
    return {
      id: PREVIEW_USER_ID,
      email: "preview@kairos.local",
      fullName: "Kairos Preview",
      isPreview: true,
      raw: null,
    };
  }, [previewMode, ownedProfile, session, recovery.status, recoveryRestored]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading: !recoveryRestored || (recovery.status === "idle" && !previewMode && loading),
      session: previewMode || !recoveryRestored || recovery.status !== "idle" ? null : session,
      user,
      profile: previewMode || !recoveryRestored || recovery.status !== "idle" ? null : ownedProfile,
      error: previewMode ? null : error,
      signInWithPassword,
      signUpWithPassword,
      signInWithOAuth,
      resetPassword,
      recovery,
      completeAuthCallback,
      updateRecoveryPassword,
      ensureRecoverySession,
      cancelPasswordRecovery,
      signOut,
      refreshProfile,
      enterPreviewMode: () => {
        if (!useAppStore.getState().previewMode) clearSessionState();
        setPreviewMode(true);
      },
    }),
    [
      clearSessionState,
      configured,
      error,
      loading,
      recovery,
      recoveryRestored,
      completeAuthCallback,
      updateRecoveryPassword,
      ensureRecoverySession,
      cancelPasswordRecovery,
      previewMode,
      ownedProfile,
      refreshProfile,
      resetPassword,
      session,
      signInWithOAuth,
      signInWithPassword,
      signOut,
      signUpWithPassword,
      setPreviewMode,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useKairosAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("useKairosAuth must be used within SupabaseAuthProvider");
  return context;
}
