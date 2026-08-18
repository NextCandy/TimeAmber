import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  FolderTree,
  Tags,
  Users,
  Settings,
  LogOut,
  ExternalLink,
  Home,
  CloudUpload,
  Image as ImageIcon,
  BarChart3,
  Sparkles,
  Bell,
  Activity,
  BrainCircuit,
  Github,
  RefreshCw,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BRAND_ICON } from "@/lib/brand";
import { logout } from "@/lib/auth.functions";
import { toast } from "sonner";

const NAV = [
  { to: "/admin", label: "概览", icon: LayoutDashboard, exact: true },
  { to: "/admin/ask", label: "Ask TimeAmber", icon: BrainCircuit, exact: false },
  { to: "/admin/posts", label: "文章", icon: FileText, exact: false },
  { to: "/admin/categories", label: "分类", icon: FolderTree, exact: false },
  { to: "/admin/tags", label: "标签", icon: Tags, exact: false },
  { to: "/admin/friends", label: "友链", icon: Users, exact: false },
  { to: "/admin/media", label: "媒体库", icon: ImageIcon, exact: false },
  { to: "/admin/analytics", label: "访客分析", icon: BarChart3, exact: false },
  { to: "/admin/sync", label: "内容同步", icon: RefreshCw, exact: false },
  { to: "/admin/backup", label: "备份与同步", icon: CloudUpload, exact: false },
  { to: "/admin/ai", label: "AI 配置", icon: Sparkles, exact: false },
  { to: "/admin/notifications", label: "通知设置", icon: Bell, exact: false },
  { to: "/admin/diagnostics", label: "性能与日志", icon: Activity, exact: false },
  { to: "/admin/github", label: "GitHub 同步", icon: Github, exact: false },
  { to: "/admin/settings", label: "公开站点", icon: Settings, exact: false },
] as const;

export function AdminSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await logout();
    toast.success("已退出登录");
    navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
    window.location.reload();
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/60 bg-linear-to-br from-primary/5 via-transparent to-transparent">
        <Link to="/admin" className="flex items-center gap-2.5 px-2 py-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center">
            <img
              src={BRAND_ICON}
              alt=""
              width={36}
              height={36}
              className="h-full w-full object-contain"
            />
          </span>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm font-semibold">TimeAmber</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Admin Console
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to, item.exact)}
                    tooltip={item.label}
                    className="border-l-[3px] border-l-transparent data-[active=true]:border-l-accent-amber data-[active=true]:bg-accent-amber-soft data-[active=true]:text-foreground"
                  >
                    <Link to={item.to}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>站点</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="查看前台">
                  <Link to="/" search={{ page: undefined }}>
                    <Home className="h-4 w-4" />
                    <span>前台首页</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="GitHub">
                  <a
                    href="https://github.com/NextCandy/TimeAmber"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>GitHub 仓库</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip="退出登录">
              <LogOut className="h-4 w-4" />
              <span>退出登录</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
