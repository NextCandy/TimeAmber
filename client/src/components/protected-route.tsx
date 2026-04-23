import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { checkAuth } from "@/lib/api";

/**
 * 路由守卫组件
 * - 认证通过 → 渲染子内容
 * - 认证未完成 → 全屏 loading（不渲染任何后台内容）
 * - 认证失败 → 重定向 /admin/login
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth().then((ok) => {
      if (ok) {
        setStatus("ok");
      } else {
        setStatus("denied");
        setLocation("/admin/login");
      }
    }).catch(() => {
      setStatus("denied");
      setLocation("/admin/login");
    });
  }, [setLocation]);

  // 认证中——不渲染任何后台内容，防止"闪烁进入"
  if (status === "checking") {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-[12px]">
          <div className="h-[32px] w-[32px] rounded-full border-2 border-foreground/10 border-t-cyan-400 animate-spin" />
          <p className="text-[13px] text-muted-foreground/40">验证身份中...</p>
        </div>
      </div>
    );
  }

  // 认证失败——已重定向，渲染空节点防止闪烁
  if (status === "denied") return null;

  // 认证通过——渲染后台内容
  return <>{children}</>;
}
