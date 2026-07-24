import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthState } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const auth = await getAuthState();
    if (!auth.authenticated) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    if (auth.mustChangePassword) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
  },
  component: () => <Outlet />,
});
