import { logout } from "@/server/actions";
import type { PublicUser, RequestListItem, RequestStatus } from "@/lib/types";
import { formatTime, statusLabel } from "@/lib/format";
import { SideNav } from "@/components/side-nav";
import Link from "next/link";
import { Icon } from "@/components/icon";

export function Sidebar({ user, inboxCount }: { user: PublicUser; inboxCount: number }) {
  return (
    <aside className="bg-deep text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto md:px-4 md:py-7">
      <div className="flex items-center gap-3 px-4 py-4 md:px-2 md:py-0">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#2c7062] text-[#d9f6eb]"><Icon name="layers" size={23} /></div>
        <div>
          <div className="text-[17px] font-semibold tracking-wide">智能审批</div>
          <div className="mt-0.5 text-[10px] tracking-[0.16em] text-[#b8d2c8]">AI APPROVAL</div>
        </div>
      </div>
      <div className="px-3 pb-3 md:mt-9 md:px-0 md:pb-6">
        <p className="mb-3 hidden px-3 text-[11px] tracking-wider text-[#a8c3b8] md:block">我的工作空间</p>
        <SideNav inboxCount={inboxCount} isAdmin={user.role === "admin"} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 md:mt-auto md:mb-7 md:block md:px-2 md:pt-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d6eee4] font-semibold text-deep">{user.displayName.slice(0, 1)}</span><div><div className="font-medium">{user.displayName}</div>
        <div className="mt-0.5 text-xs text-[#b8d2c8]">
          {user.role === "admin" ? "管理员" : "成员"} · {user.username}
        </div></div></div>
        <form action={logout} className="md:mt-4">
          <button className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-[#b8d2c8] hover:text-white" type="submit">
            <Icon name="logout" size={15} />退出登录
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
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        {eyebrow ? <div className="mb-1.5 text-xs font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
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
  return <span className={`pill pill-${status}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{statusLabel(status)}</span>;
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
  return <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-muted"><span className="grid h-11 w-11 place-items-center rounded-xl bg-mist text-muted"><Icon name="inbox" size={22} /></span><p className="max-w-md leading-6">{children}</p></div>;
}

export function RequestTable({ items, emptyText = "暂无审批记录。" }: { items: RequestListItem[]; emptyText?: string }) {
  if (!items.length) return <Empty>{emptyText}</Empty>;
  return <>
    <div className="hidden overflow-x-auto md:block">
      <table className="data-table">
        <thead><tr><th scope="col">审批事项</th><th scope="col">申请人</th><th scope="col">当前节点</th><th scope="col">状态</th><th scope="col">更新时间</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td className="min-w-36 max-w-72"><Link className="font-medium break-words hover:text-teal" href={`/requests/${item.id}`}>{item.title}</Link><p className="mt-1 text-xs text-muted">{item.workflowName} · #{String(item.id).padStart(4, "0")}</p></td>
          <td className="whitespace-nowrap">{item.initiatorName}</td>
          <td className="whitespace-nowrap text-muted">{item.currentStepName || "已结束"}</td>
          <td><StatusPill status={item.status} /></td>
          <td className="whitespace-nowrap text-xs text-muted tabular-nums">{formatTime(item.updatedAt)}</td>
          <td><Link href={`/requests/${item.id}`} className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap text-xs font-medium text-teal hover:text-teal-dark" aria-label={`查看${item.title}的详情`}>查看<Icon name="arrowRight" size={14} /></Link></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="divide-y divide-line md:hidden">{items.map((item) => <Link key={item.id} href={`/requests/${item.id}`} className="block p-4 hover:bg-mist"><div className="flex items-start justify-between gap-3"><span className="min-w-0 font-medium break-words">{item.title}</span><StatusPill status={item.status} /></div><p className="mt-2 text-xs text-muted">{item.workflowName} · {item.initiatorName} · {item.currentStepName || "已结束"}</p><div className="mt-3 flex items-center justify-between text-xs text-muted"><span>{formatTime(item.updatedAt)}</span><Icon name="arrowRight" size={15} /></div></Link>)}</div>
  </>;
}
