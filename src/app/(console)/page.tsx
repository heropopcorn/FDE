import Link from "next/link";
import { Empty, PageHeader, RequestCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { dashboardStats, listInbox, listRecent } from "@/lib/queries";

export const metadata = { title: "工作台" };

export default async function HomePage() {
  const user = await getCurrentUser();
  const stats = dashboardStats(user);
  const inbox = listInbox(user.id).slice(0, 5);
  const recent = listRecent(user, 6);
  const cards = [
    ["待我审批", stats.inbox],
    ["我发起的进行中", stats.minePending],
    ["AI 自动通过", stats.aiApprovals],
    ["已办结", stats.finished],
  ];

  return (
    <>
      <PageHeader
        eyebrow={`你好，${user.displayName}`}
        title="工作台"
        description="重复核对和排队等待，是多级审批里最耗时间的部分。规则说得清的节点交给 AI，其余仍由人确认。"
        action={
          <Link href="/start" className="btn btn-primary">
            发起审批
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-2 text-3xl font-semibold text-teal-dark">{value}</div>
          </div>
        ))}
      </section>
      <section className="card mt-5">
        <h2 className="font-semibold">建议的演示顺序</h2>
        <ol className="mt-3 grid gap-2 text-sm leading-6 text-muted">
          <li>1. 用邱剑锋发起「请假审批」，天数填 2。申佳琪或常嫕任意一人初审通过。</li>
          <li>2. 进入张安复审。他已配置「天数小于 3 直接通过」，这一级会自动通过。</li>
          <li>3. 再发起一张天数为 5 的请假。初审通过后，复审会留在张安的待办里。</li>
        </ol>
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">待我审批</h2>
          <div className="grid gap-3">
            {inbox.length === 0 ? <Empty>现在没有需要你处理的单据。</Empty> : inbox.map((item) => <RequestCard key={item.id} item={item} />)}
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-semibold">最近单据</h2>
          <div className="grid gap-3">
            {recent.length === 0 ? (
              <Empty>{user.role === "admin" ? "还没有人发起申请。" : "还没有你能查看的单据。"}</Empty>
            ) : (
              recent.map((item) => <RequestCard key={item.id} item={item} />)
            )}
          </div>
        </section>
      </div>
    </>
  );
}
