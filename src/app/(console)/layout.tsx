import { Sidebar } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { dashboardStats } from "@/lib/queries";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const stats = dashboardStats(user);
  return (
    <div className="min-h-full md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar user={user} inboxCount={stats.inbox} />
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
