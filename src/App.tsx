import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { SignIn } from "@/features/auth/SignIn";
import { Home } from "@/features/home/Home";

export default function App() {
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
        <Home />
      </Authenticated>
    </>
  );
}
