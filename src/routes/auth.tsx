import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeInitialPassword, getAuthState, login } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/admin",
  }),
  head: () => ({
    meta: [{ title: "登录 · TimeAmber 后台" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("邮箱格式不正确").max(255),
  password: z.string().min(8, "密码至少 8 位").max(128),
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getAuthState().then((auth) => {
      if (!auth.authenticated) return;
      if (auth.mustChangePassword) {
        setEmail(auth.email);
        setMustChangePassword(true);
      } else {
        window.location.replace(redirect);
      }
    });
  }, [redirect]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "请检查输入");
      return;
    }
    setLoading(true);
    try {
      const result = await login({ data: parsed.data });
      if (result.mustChangePassword) {
        setMustChangePassword(true);
        setPassword("");
        toast.info("首次登录需要设置新密码");
      } else {
        window.location.replace(redirect);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12) {
      toast.error("新密码至少 12 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await changeInitialPassword({ data: { password: newPassword } });
      toast.success("密码已更新");
      window.location.replace(redirect);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码更新失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <div className="hero-glow" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </span>
          <h1 className="font-display text-2xl font-semibold">TimeAmber 后台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mustChangePassword ? "设置新的管理员密码" : "登录以管理站点"}
          </p>
        </div>

        <form
          onSubmit={mustChangePassword ? handlePasswordChange : handleLogin}
          className="rounded-lg border border-border/70 bg-card/80 p-6"
        >
          <div className="space-y-4">
            {!mustChangePassword ? (
              <>
                <div>
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1.5"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="new-password">新密码</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password">确认新密码</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </>
            )}
          </div>

          <Button type="submit" className="mt-6 w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mustChangePassword ? "更新密码并进入后台" : "登录"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
