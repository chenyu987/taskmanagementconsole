import { Trans, useLingui } from "@lingui/react/macro";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { LocaleSwitch } from "@/lib/LocaleSwitch";

type Mode = "signIn" | "signUp";

const inputClass =
  "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors duration-150 focus:border-ink-3";

/**
 * 邮箱 + 密码登录。不公开注册：「首次设置密码」只对收到邀请的邮箱开放，
 * 其他邮箱会被后端拒绝（见 convex/auth.ts）。
 */
export function SignIn() {
  const { t } = useLingui();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const trimmed = email.trim();
    const { error } =
      mode === "signIn"
        ? await authClient.signIn.email({ email: trimmed, password, rememberMe: true })
        : await authClient.signUp.email({
            email: trimmed,
            password,
            name: trimmed.split("@")[0],
          });
    if (error) {
      setError(error.message ?? (mode === "signIn" ? t`登录失败，请重试` : t`设置失败，请重试`));
    }
    setPending(false);
  };

  const switchMode = () => {
    setMode(mode === "signIn" ? "signUp" : "signIn");
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6">
      <LocaleSwitch className="fixed right-6 top-6" />
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          <Trans>人生操作系统</Trans>
        </h1>
        <p className="text-sm text-ink-3">
          {mode === "signIn" ? (
            <Trans>用邮箱和密码登录。</Trans>
          ) : (
            <Trans>收到邀请的邮箱，第一次来请先设置密码。</Trans>
          )}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder={t`邮箱`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={mode === "signUp" ? 10 : undefined}
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          placeholder={mode === "signIn" ? t`密码` : t`设置密码（至少 10 位）`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-10 rounded-md bg-ink text-sm font-medium text-canvas transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t`请稍候…` : mode === "signIn" ? t`登录` : t`设置密码并登录`}
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
      <button
        type="button"
        onClick={switchMode}
        className="self-start text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
      >
        {mode === "signIn" ? t`收到邀请、第一次来？设置密码` : t`已经设置过密码？去登录`}
      </button>
    </main>
  );
}
