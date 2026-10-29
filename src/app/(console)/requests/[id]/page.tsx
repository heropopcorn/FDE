import { notFound } from "next/navigation";
import { RequestDetailView } from "@/components/request-detail";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { oneParam } from "@/lib/format";
import { canViewRequest, getRequestDetail } from "@/lib/queries";

export const metadata = { title: "申请详情" };

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const query = await searchParams;
  const detail = getRequestDetail(Number(id));
  if (!detail || !canViewRequest(user, detail.id)) notFound();

  return (
    <>
      <Flash error={oneParam(query.error)} />
      <RequestDetailView detail={detail} user={user} />
    </>
  );
}
