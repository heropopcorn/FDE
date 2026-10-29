"use client";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card max-w-xl">
      <h1 className="text-xl font-semibold">这一页没有加载成功</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{error.message || "请重试。如果是数据库刚初始化，刷新一次通常就能恢复。"}</p>
      <button className="btn btn-primary mt-4" type="button" onClick={() => reset()}>
        重试
      </button>
    </div>
  );
}
