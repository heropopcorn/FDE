import { Empty, PageHeader, RequestCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { listInbox } from "@/lib/queries";

export const metadata = { title: "待我审批" };

export default async function InboxPage() {
  const user = await getCurrentUser();
  const items = listInbox(user.id);

  return (
    <>
      <PageHeader title="待我审批" description="这里只显示当前节点轮到你、而且你还没有处理的单据。AI 已经通过的节点不会再出现。" />
      <div className="grid gap-3">
        {items.length === 0 ? <Empty>没有待办。可以换一个发起人提交申请，或先去配置自己的自动规则。</Empty> : items.map((item) => <RequestCard key={item.id} item={item} />)}
      </div>
    </>
  );
}
