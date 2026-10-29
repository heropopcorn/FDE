import { Empty, PageHeader, RequestCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { listMine } from "@/lib/queries";

export const metadata = { title: "我的申请" };

export default async function MinePage() {
  const user = await getCurrentUser();
  const items = listMine(user.id);

  return (
    <>
      <PageHeader title="我的申请" description="你发起的全部单据，包括审批中、已通过和已驳回。" />
      <div className="grid gap-3">
        {items.length === 0 ? <Empty>你还没有发起过申请。</Empty> : items.map((item) => <RequestCard key={item.id} item={item} />)}
      </div>
    </>
  );
}
