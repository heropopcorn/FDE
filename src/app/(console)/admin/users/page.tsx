import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createUserAction } from "@/server/actions";
import { requireAdmin } from "@/lib/auth";
import { formatTime, oneParam } from "@/lib/format";
import { listUsers } from "@/lib/queries";

export const metadata = { title: "用户管理" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const query = await searchParams;
  const users = listUsers();

  return (
    <>
      <PageHeader title="用户管理" description="管理员可以创建账号。新同事用自己的账号登录后，就能发起申请、审批，以及配置自己的自动规则。" />
      <Flash error={oneParam(query.error)} ok={query.saved === "1" ? "账号已创建，把账号和密码告诉对方即可。" : ""} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">姓名</th>
                <th className="py-2 pr-3 font-medium">账号</th>
                <th className="py-2 pr-3 font-medium">角色</th>
                <th className="py-2 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line">
                  <td className="py-3 pr-3 font-medium">{user.displayName}</td>
                  <td className="py-3 pr-3">{user.username}</td>
                  <td className="py-3 pr-3">{user.role === "admin" ? "管理员" : "成员"}</td>
                  <td className="py-3 text-muted">{formatTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <form action={createUserAction} className="card grid h-fit gap-3">
          <h2 className="text-lg font-semibold">创建账号</h2>
          <label>
            <span className="label">姓名</span>
            <input className="input" name="displayName" required maxLength={20} placeholder="例如：王林" />
          </label>
          <label>
            <span className="label">账号</span>
            <input className="input" name="username" required placeholder="例如：wanglin" autoComplete="off" />
          </label>
          <label>
            <span className="label">密码</span>
            <input className="input" name="password" type="text" required minLength={6} placeholder="至少 6 位" autoComplete="new-password" />
          </label>
          <label>
            <span className="label">角色</span>
            <select className="select" name="role" defaultValue="member">
              <option value="member">成员</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <SubmitButton pendingText="创建中…">创建</SubmitButton>
        </form>
      </div>
    </>
  );
}
