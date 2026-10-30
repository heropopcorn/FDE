"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { confirmDraftAction, createConversationAction, loadConversationAction, sendAssistantAction } from "@/server/assistant-actions";
import { formatTime, statusLabel } from "@/lib/format";
import type { AssistantView, ConversationItem } from "@/lib/assistant-types";

const prompts = [
  { icon: "calendar", title: "发起请假", text: "我想请两天事假" },
  { icon: "wallet", title: "申请报销", text: "我要报销交通费 120 元" },
  { icon: "files", title: "查询进度", text: "我的申请进度怎么样了？" },
  { icon: "inbox", title: "查看待办", text: "我有哪些待办？" },
] as const;

export function AssistantWorkspace({ initialView, conversations, displayName, workflows }: { initialView: AssistantView | null; conversations: ConversationItem[]; displayName: string; workflows: { id: number; name: string }[] }) {
  const [view, setView] = useState(initialView);
  const [history, setHistory] = useState(conversations);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingText, setPendingText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const router = useRouter();
  const draft = view?.draft;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [view?.messages.length, pending]);

  function accept(next: AssistantView) {
    setView(next);
    setHistory(items => [{ id: next.id, title: next.title, updatedAt: new Date().toISOString() }, ...items.filter(i => i.id !== next.id)].slice(0, 30));
  }
  function run(task: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setError("");
    startTransition(async () => {
      try { await task(); }
      catch { setError("连接暂时中断，请重试。已保存的草稿不会丢失。"); }
      finally { busy.current = false; setPendingText(""); }
    });
  }
  function send(message = input) {
    if (!message.trim() || busy.current) return;
    setPendingText(message);
    run(async () => {
      let current = view;
      if (!current) {
        const created = await createConversationAction();
        if (!created.ok) { setError(created.error); return; }
        current = created.data; accept(current);
      }
      const result = await sendAssistantAction({ sessionId: current.id, message, commandKey: crypto.randomUUID(), confirmationToken: current.draft?.confirmationToken });
      if (result.ok) { accept(result.data); setInput(""); router.refresh(); }
      else setError(result.error);
    });
  }
  function confirm() {
    if (!view || !draft?.ready) return;
    run(async () => {
      const result = await confirmDraftAction(view.id, draft.confirmationToken, crypto.randomUUID());
      if (result.ok) { accept(result.data); router.refresh(); }
      else setError(result.error);
    });
  }
  function open(id: string) {
    run(async () => {
      if (!id) { setView(null); setInput(""); return; }
      const result = await loadConversationAction(id);
      if (result.ok) { accept(result.data); setInput(""); } else setError(result.error);
    });
  }

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-medium text-teal">说出需求，开始办理</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight">审批助手</h1><p className="mt-2 text-sm text-muted">发起申请、查看进度，把日常审批交给一次对话。</p></div>
      <div className="flex items-center gap-2"><label className="sr-only" htmlFor="conversation-select">历史对话</label><select id="conversation-select" className="select max-w-48 text-sm" value={view?.id ?? ""} disabled={pending} onChange={e => open(e.target.value)}><option value="">新对话</option>{history.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" className="btn btn-ghost whitespace-nowrap" disabled={pending} onClick={() => open("")}><Icon name="plus" size={16} />新对话</button></div>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm" aria-label="审批对话">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-mint text-teal"><Icon name="sparkles" size={19} /></span><div><h2 className="text-sm font-semibold">你的审批助理</h2><p className="text-xs text-muted">提交前确认 · 查询实时单据</p></div><span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-teal" />{pending ? "正在处理" : "准备就绪"}</span></div>
        <div className="h-[min(58vh,620px)] min-h-80 overflow-y-auto overscroll-contain p-5 sm:p-6" role="log" aria-live="polite" aria-relevant="additions">
          {!view?.messages.length ? <div className="mx-auto max-w-xl py-6 sm:py-10"><span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-mint text-teal"><Icon name="sparkles" size={26} /></span><h2 className="text-xl font-semibold">{displayName}，今天需要办理什么？</h2><p className="mt-3 text-sm leading-7 text-muted">直接告诉我申请内容，我会帮你补全信息。也可以询问单据进度、当前审批人和待办事项。</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{prompts.map(p => <button type="button" key={p.title} disabled={pending} onClick={() => send(p.text)} className="group rounded-xl border border-line bg-white p-4 text-left transition-colors hover:border-teal/40 hover:bg-mint/40"><span className="flex items-center gap-2 text-sm font-medium"><Icon name={p.icon} size={17} className="text-teal" />{p.title}<Icon name="arrowRight" size={14} className="ml-auto text-muted" /></span><span className="mt-2 block text-xs text-muted">{p.text}</span></button>)}</div></div> : <div className="space-y-6">{view.messages.map(message => <article key={message.id} className={message.role === "user" ? "ml-8 flex justify-end" : "mr-3"}>
            <div className={message.role === "user" ? "max-w-[90%] rounded-2xl rounded-tr-sm bg-teal px-4 py-3 text-sm leading-7 whitespace-pre-wrap text-white" : "w-full"}>
              {message.role === "assistant" ? <div className="mb-2 flex items-center gap-2 text-xs font-medium text-teal"><Icon name="sparkles" size={14} />审批助手</div> : null}
              <p className={message.role === "assistant" ? "text-sm leading-7 break-words whitespace-pre-wrap" : "break-words"}>{message.text}</p>
              {!!message.requests?.length && <div className="mt-3 grid gap-2">{message.requests.map(request => <Link key={request.id} href={`/requests/${request.id}`} className="block rounded-xl border border-line bg-mist/50 p-4 transition-colors hover:border-teal/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{request.title}</p><p className="mt-1 text-xs text-muted">#{String(request.id).padStart(4, "0")} · {request.workflowName}</p></div><span className={`pill pill-${request.status}`}>{statusLabel(request.status)}</span></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{request.currentStepName ? `${request.currentStepName}${request.approvers.length ? ` · ${request.approvers.join("、")}` : ""}` : "审批已结束"}</span><span className="inline-flex items-center gap-1 text-teal">查看详情<Icon name="arrowRight" size={13} /></span></div><p className="mt-2 text-[11px] text-muted">单据更新：{formatTime(request.updatedAt)}</p></Link>)}<p className="text-[11px] text-muted">以上为本次查询时的状态，再次询问可刷新。</p></div>}
            </div>
          </article>)}</div>}
          {pending ? <div className="mt-5 space-y-3"><p className="text-right text-sm text-muted">{pendingText}</p><p className="flex items-center gap-2 text-sm text-teal" role="status"><Icon name="clock" size={16} />正在整理，请稍候…</p></div> : null}
          <div ref={endRef} />
        </div>
        <div className="border-t border-line p-4 sm:p-5">
          {error ? <div role="alert" className="mb-3 rounded-lg bg-rose-bg p-3 text-sm text-rose">{error}</div> : null}
          <form onSubmit={e => { e.preventDefault(); send(); }}><label htmlFor="assistant-input" className="sr-only">描述申请内容或查询问题</label><div className="rounded-xl border border-line bg-mist/40 p-3 focus-within:border-teal/50 focus-within:ring-2 focus-within:ring-teal/10"><textarea id="assistant-input" ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} disabled={pending} maxLength={2000} rows={2} className="w-full resize-none bg-transparent text-sm outline-none" placeholder="例如：明天请两天事假，事由是回家办理证件" /><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px] text-muted">Enter 发送，Shift + Enter 换行</span><button type="submit" className="btn btn-primary min-h-9 px-4 py-1.5" disabled={pending || !input.trim()}><Icon name="arrowRight" size={16} />发送</button></div></div></form>
        </div>
      </section>
      <aside className="grid gap-4 xl:sticky xl:top-6">
        {draft ? <section className="overflow-hidden rounded-2xl border border-line bg-white"><div className="border-b border-line bg-mint/60 p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Icon name="files" size={18} className="text-teal" />申请草稿</h2><span className={`pill ${draft.ready ? "pill-approved" : "pill-pending"}`}>{draft.ready ? "等待确认" : "待补充"}</span></div><p className="mt-2 text-xs text-muted">{draft.workflowName} · 第 {draft.version} 版</p></div><div className="p-5"><p className="mb-4 font-medium break-words">{draft.title}</p><dl className="grid gap-4">{draft.fields.map(f => <div key={f.fieldKey}><dt className="text-xs text-muted">{f.label}{f.required ? <span className="ml-1 text-rose">*</span> : null}</dt><dd className={`mt-1 text-sm break-words whitespace-pre-wrap ${draft.values[f.fieldKey] ? "text-ink" : "text-muted"}`}>{draft.values[f.fieldKey] || "尚未填写"}</dd></div>)}</dl>{!!draft.issues.length && <p className="mt-4 rounded-lg bg-amber-bg p-3 text-xs leading-6 text-amber">{draft.issues.join("；")}</p>}<button type="button" disabled={pending || !draft.ready} onClick={confirm} className="btn btn-primary mt-5 w-full"><Icon name="check" size={16} />确认并提交</button><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={pending} className="btn btn-ghost text-xs" onClick={() => { setInput("我想修改"); inputRef.current?.focus(); }}>继续修改</button><button type="button" disabled={pending} className="btn btn-ghost text-xs" onClick={() => send("取消草稿")}>取消草稿</button></div><Link href={`/start/${draft.workflowId}`} className="mt-4 block text-center text-xs text-teal">改用表单填写</Link></div></section> : <section className="rounded-2xl border border-line bg-white p-5"><div className="flex items-center gap-2 font-semibold"><Icon name="workflow" size={18} className="text-teal" />可以办理的流程</div><div className="mt-4 grid gap-1">{workflows.map(w => <button key={w.id} type="button" disabled={pending} onClick={() => send(`我要发起${w.name}`)} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-mint"><span>{w.name}</span><Icon name="chevronRight" size={14} className="text-muted" /></button>)}</div></section>}
        <div className="px-2 text-xs leading-6 text-muted"><p>填写 → 核对草稿 → 确认提交</p><p className="mt-2">对话只展示你有权限查看的单据。通过或驳回，请在单据详情中处理。</p></div>
      </aside>
    </div>
  </>;
}
