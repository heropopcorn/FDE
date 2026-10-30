import Link from "next/link";
import { PageHeader, RequestTable } from "@/components/ui";
import { Icon } from "@/components/icon";
import { DashboardCharts } from "@/components/dashboard-charts";
import { getCurrentUser } from "@/lib/auth";
import { dashboardChartData, dashboardStats, listInbox, listRecent } from "@/lib/queries";

export const metadata = { title: "工作台" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const stats = dashboardStats(user);
  const charts = dashboardChartData(user);
  const inbox = listInbox(user.id).slice(0, 5);
  const recent = listRecent(user, 6);
  const showRecent = params.view === "recent" || (params.view !== "inbox" && inbox.length === 0);
  const cards = [
    { label: "待我审批", value: stats.inbox, hint: "需要你处理的申请", icon: "inbox", href: "/inbox" },
    { label: "我发起的进行中", value: stats.minePending, hint: "等待审批的个人申请", icon: "files", href: "/mine" },
    { label: "AI 自动通过", value: stats.aiApprovals, hint: "可见单据的自动通过节点", icon: "sparkles" },
    { label: "已办结", value: stats.finished, hint: "可见范围内已结束的申请", icon: "check" },
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow={`你好，${user.displayName}`}
        title="工作台"
        description={stats.inbox ? `你有 ${stats.inbox} 项审批等待处理，查看进度并开始今天的工作。` : "目前没有待处理审批，在这里查看申请进度与 AI 判断情况。"}
        action={
          <div className="flex gap-2"><Link href="/assistant" className="btn btn-primary"><Icon name="sparkles" size={17} />对话办理</Link><Link href="/start" className="btn btn-ghost"><Icon name="plus" size={17} />表单发起</Link></div>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="审批概览">
        {cards.map((item, index) => {
          const content = <>
            <div className="flex items-center justify-between gap-3 text-sm text-muted"><span>{item.label}</span><Icon name={item.icon} size={18} className="text-teal" /></div>
            <div className={`mt-2 text-[30px] leading-tight font-semibold tabular-nums ${index === 0 ? "text-teal-dark" : "text-ink"}`}>{item.value}</div>
            <p className="mt-1 text-xs text-muted">{item.hint}</p>
          </>;
          const className = `block rounded-xl border p-4 ${index === 0 ? "border-transparent bg-mint" : "border-line bg-white"}`;
          return "href" in item ? <Link key={item.label} href={item.href} className={`${className} transition-colors hover:border-teal/40`}>{content}</Link> : <div key={item.label} className={className}>{content}</div>;
        })}
      </section>
      <div className="mt-5"><DashboardCharts data={charts} /></div>

      <section className="mt-5 overflow-hidden rounded-xl border border-line bg-white" aria-label="审批单据">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <nav className="flex items-center gap-5 text-sm" aria-label="单据列表切换">
            <Link href="/?view=inbox" aria-current={!showRecent ? "page" : undefined} className={!showRecent ? "font-semibold text-teal-dark" : "text-muted hover:text-ink"}>待我审批 <span className="ml-1 rounded-md bg-mist px-1.5 py-0.5 text-xs tabular-nums">{stats.inbox}</span></Link>
            <Link href="/?view=recent" aria-current={showRecent ? "page" : undefined} className={showRecent ? "font-semibold text-teal-dark" : "text-muted hover:text-ink"}>最近单据</Link>
          </nav>
          {!showRecent ? <Link href="/inbox" className="flex items-center gap-1 text-xs text-teal-dark">查看全部<Icon name="arrowRight" size={14} /></Link> : <span className="text-xs text-muted">最近更新的 {recent.length} 项</span>}
        </div>
        <RequestTable items={showRecent ? recent : inbox} emptyText={showRecent ? "还没有可查看的申请，发起第一份审批吧。" : "现在没有需要你处理的单据。"} />
      </section>
      <details className="mt-5 rounded-xl border border-line bg-white px-5 py-4">
        <summary className="cursor-pointer text-sm text-muted">演示指引</summary>
        <ol className="mt-4 grid gap-2 text-sm leading-6 text-muted">
          <li>1. 用邱剑锋发起「请假审批」，天数填 2，由申佳琪或常嫕完成初审。</li>
          <li>2. 进入张安复审。默认规则为「天数小于 3 直接通过」，可观察 AI 判断及引用依据。</li>
          <li>3. 再发起天数为 5 的申请，观察转人工处理。实际结果以当前规则、知识库与模型判断为准。</li>
        </ol>
      </details>
    </>
  );
}
