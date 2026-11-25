import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin,
    });
    if (error) {
      setError(error.message ?? "登录失败，请重试");
      setPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">人生操作系统</h1>
        <p className="text-sm text-ink-3">用 Google 账号登录。</p>
      </div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="h-10 rounded-md bg-ink text-sm font-medium text-canvas transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "正在跳转…" : "使用 Google 登录"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </main>
  );
}
