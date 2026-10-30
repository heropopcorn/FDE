"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";

type RuleItem = {
  workflowId: number;
  workflowName: string;
  enabled: boolean;
  approver: boolean;
};

export function RuleWorkspace({
  items,
  savedId,
  children,
}: {
  items: RuleItem[];
  savedId: number;
  children: ReactNode[];
}) {
  const [selectedId, setSelectedId] = useState(() =>
    items.find((item) => item.workflowId === savedId)?.workflowId ??
    items.find((item) => item.approver)?.workflowId ??
    items[0]?.workflowId,
  );

  if (items.length === 0) {
    return <div className="card py-10 text-center text-sm text-muted">暂无可配置的审批流程。</div>;
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="card" aria-label="选择审批流程">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted">选择流程 · {items.length}</h2>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
          {items.map((item) => {
            const selected = item.workflowId === selectedId;
            return (
              <button
                key={item.workflowId}
                type="button"
                aria-pressed={selected}
                aria-controls={`rule-panel-${item.workflowId}`}
                onClick={() => setSelectedId(item.workflowId)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left transition-colors ${selected ? "border-teal/20 bg-mint text-teal-dark" : "border-transparent hover:bg-mist"}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.workflowName}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${item.enabled ? "bg-teal" : "bg-line"}`} aria-hidden="true" />
                    {item.enabled ? "规则已启用" : "规则未启用"}
                  </span>
                </span>
                <Icon name="chevronRight" size={15} className={selected ? "text-teal" : "text-muted"} />
              </button>
            );
          })}
        </div>
      </aside>
      <div className="min-w-0">
        {items.map((item, index) => (
          <section
            key={item.workflowId}
            id={`rule-panel-${item.workflowId}`}
            aria-label={`${item.workflowName}规则配置`}
            hidden={item.workflowId !== selectedId}
            className={item.workflowId !== selectedId ? "hidden" : undefined}
          >
            {children[index]}
          </section>
        ))}
      </div>
    </div>
  );
}
