import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getOptionalUser } from "@/lib/auth";

export const metadata = { title: "登录" };

const points = ["五条流程，都是初审再复审", "请假初审两人中过一个即可", "审批人可为自己的节点写自动规则"];

export default async function LoginPage() {
  const user = await getOptionalUser();
  if (user) redirect("/");

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(300px,0.82fr)_minmax(460px,1.18fr)]">
      <section className="bg-deep px-6 py-8 text-white lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal text-xl font-bold">审</div>
            <div>
              <div className="text-sm text-white/60">灯塔场景 · 场景智改</div>
              <div className="text-lg font-semibold">第 3 组 · 麻辣小龙虾</div>
            </div>
          </div>
          <h1 className="mt-8 text-4xl font-semibold leading-tight">智能审批</h1>
          <p className="mt-4 max-w-sm text-sm leading-7 text-white/75">
            先把账号、发起和两级审批跑通。规则写清楚的节点，可以由模型直接通过，其余仍留给人工。
          </p>
        </div>
        <ul className="mt-8 grid gap-3">
          {points.map((point) => (
            <li key={point} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
              {point}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex items-center px-4 py-8 sm:px-8 lg:min-h-screen">
        <div className="mx-auto w-full max-w-xl">
          <h2 className="text-2xl font-semibold">选择身份登录</h2>
          <p className="mt-2 mb-5 text-sm text-muted">点一个人名就会填好账号和密码，也可以自己输入。</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
