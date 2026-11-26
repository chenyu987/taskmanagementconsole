import { Trans } from "@lingui/react/macro";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { SignIn } from "@/features/auth/SignIn";
import { Home } from "@/features/home/Home";
import { MembersPage } from "@/features/members/MembersPage";
import { OutlinePage } from "@/features/outline/OutlinePage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { LocaleSync } from "@/lib/LocaleSync";
import { navigate, useHashRoute } from "@/lib/useHashRoute";

export default function App() {
  const route = useHashRoute();
  return (
    <>
      <AuthLoading>
        <main className="grid min-h-dvh place-items-center text-ink-3">
          <span className="text-sm">
            <Trans>正在加载…</Trans>
          </span>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <LocaleSync />
        {route === "/members" ? (
          <MembersPage onBack={() => navigate("/")} />
        ) : route === "/tasks" ? (
          <TasksPage onBack={() => navigate("/")} />
        ) : route === "/outline" || route.startsWith("/outline/") ? (
          <OutlinePage
            zoomId={route.slice("/outline/".length) || null}
            onZoom={(id) => navigate(id ? `/outline/${id}` : "/outline")}
            onBack={() => navigate("/")}
          />
        ) : (
          <Home />
        )}
      </Authenticated>
    </>
  );
}
