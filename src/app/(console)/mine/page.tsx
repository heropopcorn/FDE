import { PageHeader, RequestTable } from "@/components/ui";
import { Icon } from "@/components/icon";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listMine } from "@/lib/queries";

export const metadata = { title: "我的申请" };

export default async function MinePage() {
  const user = await getCurrentUser();
  const items = listMine(user.id);

  return (
    <>
      <PageHeader title="我的申请" description="跟进申请进度，查看审批结果和流转记录。" action={<Link href="/start" className="btn btn-primary"><Icon name="plus" size={16} />发起审批</Link>} />
      <section className="table-shell"><div className="flex items-center gap-2 border-b border-line px-5 py-4"><Icon name="files" className="text-teal" /><h2 className="font-semibold">全部申请</h2><span className="pill pill-neutral">{items.length} 项</span></div><RequestTable items={items} emptyText="你还没有发起过申请，点击右上方“发起审批”开始。" /></section>
    </>
  );
}
