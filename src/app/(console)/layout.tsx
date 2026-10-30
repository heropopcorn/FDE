import { Sidebar } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { dashboardStats } from "@/lib/queries";
import { Icon } from "@/components/icon";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const stats = dashboardStats(user);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <Sidebar user={user} inboxCount={stats.inbox} />
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto w-full max-w-6xl"><div className="mb-7 flex items-center justify-between gap-4 text-xs text-muted"><span className="flex items-center gap-2"><Icon name="layers" size={14} />工作空间<span className="text-line">/</span>智能审批</span><span className="hidden sm:inline">第 3 组 · 麻辣小龙虾</span></div>{children}</div>
      </main>
    </div>
  );
}
