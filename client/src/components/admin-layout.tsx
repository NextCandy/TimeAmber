import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { clearToken } from "@/lib/api";
import {
  LayoutDashboard,
  StickyNote,
  MessageCircle,
  ImageIcon,
  BarChart3,
  HardDrive,
  Settings,
  LogOut,
  ExternalLink,
  Menu,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    clearToken();
    setLocation("/admin/login");
  };

  const navGroups = [
    {
      title: "内容管理",
      items: [
        { href: "/admin", icon: LayoutDashboard, label: "控制台" },
        { href: "/admin/pages", icon: StickyNote, label: "独立页面" },
        { href: "/admin/comments", icon: MessageCircle, label: "评论审核" },
      ],
    },
    {
      title: "资源与数据",
      items: [
        { href: "/admin/media", icon: ImageIcon, label: "媒体库" },
        { href: "/admin/analytics", icon: BarChart3, label: "数据分析" },
        { href: "/admin/backup", icon: HardDrive, label: "安全备份" },
      ],
    },
    {
      title: "系统配置",
      items: [
        { href: "/admin/settings", icon: Settings, label: "站点设置" },
      ],
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Brand */}
      <div className="p-6">
        <Link href="/admin" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-lg">
            M
          </div>
          <span className="font-semibold text-lg tracking-tight">Monolith</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.href === "/admin" 
                  ? location === "/admin" 
                  : location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / User Profile */}
      <div className="p-4 mt-auto border-t">
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">主题设置</span>
            <ThemeToggle />
          </div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            查看站点
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-red-500/80 hover:bg-red-500/10 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-muted/10 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          {/* Sidebar Sheet */}
          <aside id="admin-mobile-navigation" className="relative flex-col w-[280px] max-w-[80vw] h-full bg-background shadow-2xl animate-in slide-in-from-left">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-2 font-semibold">
             <div className="w-6 h-6 rounded bg-foreground text-background flex items-center justify-center text-xs font-bold">M</div>
             <span>Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
              aria-label="打开后台导航菜单"
            aria-expanded={mobileMenuOpen}
              aria-controls="admin-mobile-navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
