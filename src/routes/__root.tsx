import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { SITE_URL } from "../lib/brand";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { AdminStoreProvider, useAdminStore } from "../lib/admin-store";
import { loadPublicChrome } from "../lib/state.functions";
import { Toaster } from "../components/ui/sonner";
import { installDiagnostics, recordRouteChange } from "../lib/diagnostics";
import { DEFAULT_THEME_PREFERENCE, THEME_BOOTSTRAP_SCRIPT, resolveTheme } from "../lib/theme";
import { loadThemePreference } from "../lib/theme.functions";

function AnalyticsRecorder() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { recordAnalytics } = useAdminStore();
  useEffect(() => {
    if (typeof window === "undefined") return;
    installDiagnostics();
    recordRouteChange(pathname);
    if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) return;
    recordAnalytics({
      at: new Date().toISOString(),
      path: pathname,
      referrer: document.referrer || undefined,
    });
  }, [pathname, recordAnalytics]);
  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold">页面不存在</h2>
        <p className="mt-2 text-sm text-muted-foreground">这段时光还没有沉淀成琥珀。</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            回到首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold">出了点问题</h1>
        <p className="mt-2 text-sm text-muted-foreground">页面没能正常加载，可以重试或回到首页。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            重试
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            回到首页
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => ({
    themePreference: await loadThemePreference().catch(() => DEFAULT_THEME_PREFERENCE),
  }),
  // 只取站点外壳（导航、页脚、友链、分类与标签清单）。文章不在这里下发 ——
  // root loader 的结果会进每一个页面的 hydration payload，早先带上全部文章时
  // 首页 HTML 有 1.33 MB，而首页自己一个字段都用不到。
  loader: async () => {
    try {
      return { publicState: await loadPublicChrome() };
    } catch {
      return { publicState: null };
    }
  },
  head: () => {
    const description = "时光成珀，字字如初。一个关于剪藏、自建服务与 AI Agent 实践的中文博客。";
    // 社交平台不解析相对路径，og:image 用绝对地址。子路由（如文章页）会覆盖同名标签。
    const ogImage = `${SITE_URL}/brand/timeamber-default-cover.png`;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "TimeAmber · 时光琥珀" },
        { name: "description", content: description },
        { name: "author", content: "TimeAmber" },
        { property: "og:site_name", content: "TimeAmber" },
        { property: "og:locale", content: "zh_CN" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: "TimeAmber · 时光琥珀" },
        { property: "og:description", content: description },
        { property: "og:image", content: ogImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "TimeAmber · 时光琥珀" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "TimeAmber · 时光琥珀" },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
        { name: "twitter:image:alt", content: "TimeAmber · 时光琥珀" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/brand/favicon.ico", sizes: "any" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/brand/favicon-32x32.png" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "/brand/favicon-16x16.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/brand/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { themePreference } = Route.useRouteContext();
  const initialTheme = resolveTheme(themePreference);

  return (
    <html
      lang="zh-CN"
      className={initialTheme}
      data-theme-preference={themePreference}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, themePreference } = Route.useRouteContext();
  const { publicState } = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChrome = !(pathname.startsWith("/admin") || pathname.startsWith("/auth"));

  return (
    <QueryClientProvider client={queryClient}>
      <AdminStoreProvider initialState={publicState}>
        <AnalyticsRecorder />
        <div className="flex min-h-screen flex-col">
          {isChrome && <Navbar initialThemePreference={themePreference} />}
          <main className="flex-1">
            <Outlet />
          </main>
          {isChrome && <Footer />}
        </div>
        <Toaster position="top-center" richColors />
      </AdminStoreProvider>
    </QueryClientProvider>
  );
}
