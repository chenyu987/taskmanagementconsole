import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { SignIn } from "@/features/auth/SignIn";
import { Home } from "@/features/home/Home";
import { MembersPage } from "@/features/members/MembersPage";
import { navigate, useHashRoute } from "@/lib/useHashRoute";

export default function App() {
  const route = useHashRoute();
  return (
    <>
      <AuthLoading>
        <main className="grid min-h-dvh place-items-center text-ink-3">
          <span className="text-sm">正在加载…</span>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        {route === "/members" ? <MembersPage onBack={() => navigate("/")} /> : <Home />}
      </Authenticated>
    </>
  );
}
