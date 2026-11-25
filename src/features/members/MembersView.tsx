import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

export type WorkspaceItem = { _id: string; name: string; role: "owner" | "member" };
export type MemberItem = {
  _id: string;
  email: string;
  role: "owner" | "member";
  joined: boolean;
  isMe: boolean;
};

/** 后端错误码 → 给人看的话 */
export function memberErrorText(code: string | undefined, action: "invite" | "remove" | "role") {
  switch (code) {
    case "ALREADY_MEMBER":
      return "这个邮箱已经在这个空间里了。";
    case "INVALID_EMAIL":
      return "邮箱格式不对。";
    case "MOUNT_RULE":
      return action === "invite"
        ? "要先把这个人加进挂在本空间下面的空间（例如 EverHarvest），才能加进这里。"
        : "这个人还在上层空间里，要先从上层空间移除。";
    case "LAST_OWNER":
      return "每个空间至少要留一个所有者。";
    case "FORBIDDEN":
      return "只有所有者能管理成员。";
    default:
      return "没有成功，请重试。";
  }
}

/**
 * 空间与成员：LYC 在这里决定每个人能看哪些空间。
 * 纯展示组件，数据和操作由 MembersPage（真数据）或示例页（样例数据）传入。
 */
export function MembersView({
  workspaces,
  selectedId,
  onSelect,
  members,
  onInvite,
  onRemove,
  onSetRole,
  onBack,
}: {
  workspaces: WorkspaceItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  members: MemberItem[] | undefined;
  onInvite: (email: string, role: "owner" | "member") => Promise<string | null>;
  onRemove: (id: string) => Promise<string | null>;
  onSetRole: (id: string, role: "owner" | "member") => Promise<string | null>;
  onBack?: () => void;
}) {
  const ws = workspaces.find((w) => w._id === selectedId);
  const isOwner = ws?.role === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "member">("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | null>, ok?: string) => {
    setPending(true);
    setError(null);
    setNotice(null);
    const err = await fn();
    setPending(false);
    if (err) setError(err);
    else if (ok) setNotice(ok);
    return !err;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    const ok = await run(
      () => onInvite(target, role),
      `已邀请 ${target}。请对方打开登录页，点「收到邀请、第一次来？设置密码」，用这个邮箱设密码。`,
    );
    if (ok) setEmail("");
  };

  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-16">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">空间与成员</h1>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
          >
            返回今天
          </button>
        )}
      </header>
      <p className="mt-2 text-sm text-ink-3">成员能看到并编辑所在空间里的全部内容，看不到其他空间。</p>

      <div className="mt-8 flex gap-5 text-sm" role="tablist" aria-label="空间">
        {workspaces.map((w) => (
          <button
            key={w._id}
            type="button"
            role="tab"
            aria-selected={w._id === selectedId}
            onClick={() => {
              onSelect(w._id);
              setError(null);
              setNotice(null);
            }}
            className={cn(
              "transition-colors duration-150",
              w._id === selectedId ? "font-medium text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {w.name}
          </button>
        ))}
      </div>

      {isOwner && (
        <form onSubmit={submit} className="mt-8 flex gap-2">
          <input
            type="email"
            required
            placeholder="邀请成员的邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-ink-3"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "owner" | "member")}
            aria-label="角色"
            className="h-10 rounded-md border border-line bg-canvas px-2 text-sm text-ink-2 outline-none focus:border-ink-3"
          >
            <option value="member">成员</option>
            <option value="owner">所有者</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-canvas transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            邀请
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && <p className="mt-3 text-sm text-ink-2">{notice}</p>}

      <section className="mt-8">
        {members === undefined ? (
          <p className="text-sm text-ink-3">正在加载…</p>
        ) : (
          <ul>
            {members.map((m) => (
              <li
                key={m._id}
                className="group -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors duration-150 hover:bg-fill"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-ink">
                    {m.email}
                    {m.isMe && <span className="ml-2 text-xs text-ink-3">你</span>}
                  </p>
                  <p className="text-xs text-ink-3">{m.joined ? "已加入" : "已邀请，等对方注册"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm">
                  {isOwner && !m.isMe && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void run(() => onRemove(m._id))}
                      className="text-ink-3 opacity-0 transition-[opacity,color] duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      移除
                    </button>
                  )}
                  {isOwner && !m.isMe ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void run(() => onSetRole(m._id, m.role === "owner" ? "member" : "owner"))
                      }
                      title="点击切换角色"
                      className="w-14 text-right text-ink-2 transition-colors duration-150 hover:text-ink"
                    >
                      {m.role === "owner" ? "所有者" : "成员"}
                    </button>
                  ) : (
                    <span className="w-14 text-right text-ink-3">
                      {m.role === "owner" ? "所有者" : "成员"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
