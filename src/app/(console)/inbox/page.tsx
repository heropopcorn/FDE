import { PageHeader, RequestTable } from "@/components/ui";
import { Icon } from "@/components/icon";
import { getCurrentUser } from "@/lib/auth";
import { listInbox } from "@/lib/queries";

export const metadata = { title: "待我审批" };

export default async function InboxPage() {
  const user = await getCurrentUser();
  const items = listInbox(user.id);

  return (
    <>
      <PageHeader title="待我审批" description="查看当前轮到你处理的申请，确认信息后完成审批。" />
      <section className="table-shell"><div className="flex items-center gap-2 border-b border-line px-5 py-4"><Icon name="inbox" className="text-teal" /><h2 className="font-semibold">待处理事项</h2><span className="pill pill-neutral">{items.length} 项</span></div><RequestTable items={items} emptyText="当前没有待处理的审批，新的待办会显示在这里。" /></section>
    </>
  );
}
