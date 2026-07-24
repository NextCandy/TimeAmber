import { createServerFn } from "@tanstack/react-start";
import { clearSession } from "@tanstack/react-start/server";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAuthSession,
  createUserClient,
  getAuthSession,
  sessionConfig,
} from "@/integrations/supabase/session.server";

const loginInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((value: z.infer<typeof loginInput>) => loginInput.parse(value))
  .handler(async ({ data }) => {
    const session = await createAuthSession(data.email, data.password);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role,must_change_password")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (profile?.role !== "admin") {
      await clearSession(sessionConfig());
      throw new Error("Administrator access required");
    }
    return {
      ok: true,
      email: session.email,
      mustChangePassword: Boolean(profile.must_change_password),
    };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await clearSession(sessionConfig());
  return { ok: true };
});

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getAuthSession();
  if (!session) return { authenticated: false as const };
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role,must_change_password")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (profile?.role !== "admin") return { authenticated: false as const };
  return {
    authenticated: true as const,
    email: session.email,
    mustChangePassword: Boolean(profile.must_change_password),
  };
});

const passwordInput = z.object({
  password: z.string().min(12).max(128),
});

export const changeInitialPassword = createServerFn({ method: "POST" })
  .inputValidator((value: z.infer<typeof passwordInput>) => passwordInput.parse(value))
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    if (!session) throw new Error("Unauthorized");
    const userClient = createUserClient(session.accessToken);
    const { error } = await userClient.auth.updateUser({ password: data.password });
    if (error) throw error;
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("user_id", session.userId);
    return { ok: true };
  });

