import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LocaleSwitch } from "@/lib/LocaleSwitch";

/** 阶段 0 的占位首页：确认登录和成员资格。阶段 1 由「今日视图」替换。 */
export function Home() {
  const claimInvites = useMutation(api.memberships.claimInvites);
  const me = useQuery(api.viewer.me);
  const saveLocale = useMutation(api.prefs.setLocale);

  useEffect(() => {
    void claimInvites();
  }, [claimInvites]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-12 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          <Trans>今天</Trans>
        </h1>
        <div className="flex gap-5">
          <LocaleSwitch onSwitch={(locale) => void saveLocale({ locale })} />
          <a
            href="#/members"
            className="text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
          >
            <Trans>空间与成员</Trans>
          </a>
          <button
            type="button"
            onClick={() => void authClient.signOut()}
            className="text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
          >
            <Trans>退出</Trans>
          </button>
        </div>
      </header>

      {me === undefined ? (
        <p className="text-sm text-ink-3">
          <Trans>正在加载…</Trans>
        </p>
      ) : me.workspaces.length === 0 ? (
        <section className="space-y-2">
          <p className="text-ink">
            <Trans>这个账号还没有加入任何空间。</Trans>
          </p>
          <p className="text-sm text-ink-3">
            <Trans>请让空间的所有者用你的登录邮箱邀请你。</Trans>
          </p>
        </section>
      ) : (
        <section className="space-y-1">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">
            <Trans>我的空间</Trans>
          </h2>
          {me.workspaces.map((ws) => (
            <div key={ws._id} className="flex items-baseline justify-between py-2">
              <span className="text-ink">{ws.name}</span>
              <span className="text-xs text-ink-3">{ws.role === "owner" ? <Trans>所有者</Trans> : <Trans>成员</Trans>}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
