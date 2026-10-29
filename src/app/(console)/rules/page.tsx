import { SubmitButton } from "@/components/submit-button";
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
        title="AI 规则"
        description="规则按「你自己 + 某个流程」保存。只有单据流转到你负责的节点时才会执行。例如：天数小于 3，直接通过；否则转人工。"
      />
      <Flash error={oneParam(query.error)} />
      <p className="mb-4 text-sm text-muted">当前优先调用的免费模型：{preferredModelLabel}。如果它限流，会自动换下一个免费模型。</p>
      <div className="grid gap-4">
        {rules.map((rule) => (
          <form key={rule.workflowId} action={saveRuleAction} className="card grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{rule.workflowName}</h2>
              {rule.approver ? <span className="pill pill-approved">你是审批人</span> : <span className="pill pill-pending">你还不是审批人</span>}
            </div>
            {savedId === rule.workflowId ? <div className="flash flash-ok">这条规则已保存。</div> : null}
            <input type="hidden" name="workflowId" value={rule.workflowId} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" value="1" defaultChecked={rule.enabled} className="accent-teal" />
              启用自动审批
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="useKnowledge" value="1" defaultChecked={rule.useKnowledge} className="accent-teal" />
              参考知识库
            </label>
            <p className="text-xs leading-5 text-muted">
              打开后，自动审批会同时检索公司规范。个人规则允许通过，但规范不允许时，不会直接通过。
            </p>
            <label>
              <span className="label">规则</span>
              <textarea
                className="textarea"
                name="ruleText"
                defaultValue={rule.ruleText}
                maxLength={2000}
                placeholder="如果天数小于 3，直接通过；天数大于或等于 3 时转人工，不要拒绝。"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted">{rule.updatedAt ? `更新于 ${formatTime(rule.updatedAt)}` : "还没有保存过"}</span>
              <SubmitButton pendingText="保存中…">保存规则</SubmitButton>
            </div>
          </form>
        ))}
      </div>
    </>
  );
}
