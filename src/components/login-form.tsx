"use client";

import { useActionState, useState } from "react";
import { login } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";

const accounts = [
  { name: "系统管理员", username: "admin", password: "admin123", role: "配置账号和流程" },
  { name: "张安", username: "zhangan", password: "123456", role: "请假复审 · 费用初审" },
  { name: "邱剑锋", username: "qiujianfeng", password: "123456", role: "费用复审 · 宣发初审" },
  { name: "申佳琪", username: "shenjiaqi", password: "123456", role: "请假初审 · 宣发复审" },
  { name: "常嫕", username: "changyi", password: "123456", role: "请假初审 · 服务器复审 · 技术支持初审" },
  { name: "黄尊宣", username: "huangzunxuan", password: "123456", role: "服务器初审 · 技术支持复审" },
];

export function LoginForm() {
  const [state, action] = useActionState(login, { error: "" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="grid gap-4">
      {state.error ? <div className="flash flash-bad">{state.error}</div> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((account) => {
          const selected = username === account.username;
          return (
            <button
              key={account.username}
              type="button"
              aria-pressed={selected}
              className={`rounded-2xl border px-3 py-3 text-left ${
                selected ? "border-teal bg-mint" : "border-line bg-white hover:border-teal"
              }`}
              onClick={() => {
                setUsername(account.username);
                setPassword(account.password);
              }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{account.name}</span>
                <span className="text-xs text-muted">{account.username}</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted">{account.role}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">账号</span>
          <input
            className="input"
            name="username"
            value={username}
            placeholder="选择上方身份"
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          <span className="label">密码</span>
          <input
            className="input"
            name="password"
            value={password}
            placeholder="演示密码"
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
      </div>
      <SubmitButton pendingText="正在登录…">登录</SubmitButton>
    </form>
  );
}
