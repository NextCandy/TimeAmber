import { createClient } from "@supabase/supabase-js";
import { clearSession, useSession as getServerSession } from "@tanstack/react-start/server";

export type AuthSessionData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
};

export function sessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }
  return {
    name: "timeamber-session",
    password,
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure:
        process.env.COOKIE_SECURE === "true" ||
        (process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production"),
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function authClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured");
  return createClient(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getAuthSession(): Promise<AuthSessionData | null> {
  const session = await getServerSession<AuthSessionData>(sessionConfig());
  const current = session.data;
  if (
    !current?.accessToken ||
    !current.refreshToken ||
    !current.expiresAt ||
    !current.userId ||
    !current.email
  ) {
    return null;
  }
  const complete: AuthSessionData = {
    accessToken: current.accessToken,
    refreshToken: current.refreshToken,
    expiresAt: current.expiresAt,
    userId: current.userId,
    email: current.email,
  };
  if (complete.expiresAt > Math.floor(Date.now() / 1000) + 60) return complete;

  const { data, error } = await authClient().auth.refreshSession({
    refresh_token: current.refreshToken,
  });
  if (error || !data.session || !data.user) {
    await clearSession(sessionConfig());
    return null;
  }
  const refreshed: AuthSessionData = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId: data.user.id,
    email: data.user.email ?? complete.email,
  };
  await session.update(refreshed);
  return refreshed;
}

export async function createAuthSession(email: string, password: string) {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(error?.message ?? "Login failed");
  }
  const value: AuthSessionData = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId: data.user.id,
    email: data.user.email ?? email,
  };
  const session = await getServerSession<AuthSessionData>(sessionConfig());
  await session.update(value);
  return value;
}

export function createUserClient(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
