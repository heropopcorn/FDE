import { logout } from "@/server/actions";
import type { PublicUser, RequestListItem, RequestStatus } from "@/lib/types";
import { formatTime, statusLabel } from "@/lib/format";
import { SideNav } from "@/components/side-nav";
import Link from "next/link";

export function Sidebar({ user, inboxCount }: { user: PublicUser; inboxCount: number }) {
  return (
    <aside className="bg-deep text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col md:px-4 md:py-5">
      <div className="flex items-center gap-3 px-4 py-4 md:px-2 md:py-0">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal text-lg font-bold">审</div>
        <div>
          <div className="text-lg font-semibold tracking-wide">智能审批</div>
          <div className="text-xs text-white/65">第 3 组 · 麻辣小龙虾</div>
        </div>
      </div>
      <div className="px-3 pb-3 md:mt-6 md:px-0 md:pb-0">
        <SideNav inboxCount={inboxCount} isAdmin={user.role === "admin"} />
      </div>
      <div className="border-t border-white/10 px-4 py-4 md:mt-auto md:mb-12 md:px-2">
        <div className="font-semibold">{user.displayName}</div>
        <div className="mt-1 text-sm text-white/65">
          {user.role === "admin" ? "管理员" : "成员"} · {user.username}
        </div>
        <form action={logout} className="mt-3">
          <button className="text-sm text-white/80 underline-offset-2 hover:underline" type="submit">
            退出登录
          </button>
        </form>
      </div>
    </aside>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <div className="mb-1 text-sm font-semibold text-teal-dark">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <div className="flash flash-bad">{error}</div>;
  if (ok) return <div className="flash flash-ok">{ok}</div>;
  return null;
}

export function StatusPill({ status }: { status: RequestStatus }) {
  return <span className={`pill pill-${status}`}>{statusLabel(status)}</span>;
}

export function RequestCard({ item }: { item: RequestListItem }) {
  return (
    <Link href={`/requests/${item.id}`} className="card-link">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{item.title}</div>
          <div className="mt-1 text-sm text-muted">
            {item.workflowName}
            {item.currentStepName ? ` · 当前：${item.currentStepName}` : ""}
            {` · ${item.initiatorName}`}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>
      <div className="mt-3 text-xs text-muted">{formatTime(item.updatedAt)}</div>
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}
