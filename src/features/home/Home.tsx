import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

/** 阶段 0 的占位首页：确认登录和成员资格。阶段 1 由「今日视图」替换。 */
export function Home() {
  const claimInvites = useMutation(api.memberships.claimInvites);
  const me = useQuery(api.viewer.me);

  useEffect(() => {
    void claimInvites();
  }, [claimInvites]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-12 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">今天</h1>
        <button
          type="button"
          onClick={() => void authClient.signOut()}
          className="text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          退出
        </button>
      </header>

      {me === undefined ? (
        <p className="text-sm text-ink-3">正在加载…</p>
      ) : me.workspaces.length === 0 ? (
        <section className="space-y-2">
          <p className="text-ink">这个账号还没有加入任何空间。</p>
          <p className="text-sm text-ink-3">请让空间的所有者用你的登录邮箱邀请你。</p>
        </section>
      ) : (
        <section className="space-y-1">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">我的空间</h2>
          {me.workspaces.map((ws) => (
            <div key={ws._id} className="flex items-baseline justify-between py-2">
              <span className="text-ink">{ws.name}</span>
              <span className="text-xs text-ink-3">{ws.role === "owner" ? "所有者" : "成员"}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
