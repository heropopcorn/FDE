import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icon";
import { RuleWorkspace } from "@/components/rule-workspace";
import { Flash, PageHeader } from "@/components/ui";
import { saveRuleAction } from "@/server/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatTime, oneParam } from "@/lib/format";
import { listAiRules } from "@/lib/queries";
import { preferredModelLabel } from "@/lib/ai";

export const metadata = { title: "AI 规则" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const rules = listAiRules(user.id);
  const savedId = Number(oneParam(query.saved));

  return (
    <>
      <PageHeader
        eyebrow="个人审批偏好"
        title="AI 规则"
        description="为不同流程配置你的审批条件，单据流转到你负责的节点时生效。"
      />
      <Flash error={oneParam(query.error)} />
      <RuleWorkspace items={rules.map(({ workflowId, workflowName, enabled, approver }) => ({ workflowId, workflowName, enabled, approver }))} savedId={savedId}>
        {rules.map((rule) => (
          <form key={rule.workflowId} action={saveRuleAction} className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint text-teal"><Icon name="sparkles" size={20} /></span>
                <div><h2 className="text-lg font-semibold">{rule.workflowName}</h2><p className="mt-1 text-xs text-muted">你的自动审批规则</p></div>
              </div>
              {rule.approver ? <span className="pill pill-approved">你是审批人</span> : <span className="pill bg-mist text-muted">暂未分配审批节点</span>}
            </div>
            {savedId === rule.workflowId ? <div className="flash flash-ok mt-4" role="status">这条规则已保存。</div> : null}
            <input type="hidden" name="workflowId" value={rule.workflowId} />
            <div className="my-5 divide-y divide-line rounded-lg border border-line px-4">
              <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
                <span><span className="block text-sm font-medium">启用自动审批</span><span className="mt-1 block text-xs leading-5 text-muted">让 AI 根据下方条件判断你负责的审批节点</span></span>
                <input type="checkbox" name="enabled" value="1" defaultChecked={rule.enabled} className="h-4 w-4 shrink-0 cursor-pointer accent-teal" />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
                <span><span className="block text-sm font-medium">参考知识库</span><span className="mt-1 block text-xs leading-5 text-muted">检索公司规范，为判断提供参考依据</span></span>
                <input type="checkbox" name="useKnowledge" value="1" defaultChecked={rule.useKnowledge} className="h-4 w-4 shrink-0 cursor-pointer accent-teal" />
              </label>
            </div>
            <label className="block">
              <span className="label">审批条件</span>
              <span className="mb-3 block text-xs leading-5 text-muted">写清适用条件和对应处理方式，无法判断的情况可设为转人工。</span>
              <textarea
                className="textarea"
                name="ruleText"
                defaultValue={rule.ruleText}
                rows={6}
                maxLength={2000}
                placeholder="如果天数小于 3，直接通过；天数大于或等于 3 时转人工，不要拒绝。"
              />
            </label>
            {!rule.approver ? <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted"><Icon name="info" size={15} className="mt-0.5 shrink-0" />可以提前保存规则，分配到该流程的审批节点后才会生效。</p> : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <span className="text-xs text-muted">{rule.updatedAt ? `更新于 ${formatTime(rule.updatedAt)}` : "还没有保存过"}</span>
              <SubmitButton pendingText="保存中…"><Icon name="check" size={16} />保存规则</SubmitButton>
            </div>
          </form>
        ))}
      </RuleWorkspace>
      <details className="mt-5 text-xs leading-6 text-muted">
        <summary className="w-fit cursor-pointer rounded hover:text-teal">查看模型配置</summary>
        <p className="mt-2">当前优先模型：{preferredModelLabel}。遇到限流时，系统会尝试下一个已配置模型。</p>
      </details>
    </>
  );
}
