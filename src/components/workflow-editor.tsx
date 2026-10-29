"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveWorkflowAction } from "@/server/actions";
import type { ApproveMode, FieldType, PublicUser, WorkflowInput } from "@/lib/types";

export type FieldDraft = {
  uid: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  options: string;
};

export type StepDraft = {
  uid: string;
  name: string;
  approveMode: ApproveMode;
  approverIds: number[];
};

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: "text", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "select", label: "单选" },
];

function splitOptions(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function WorkflowEditor({
  workflowId,
  locked,
  users,
  initialName,
  initialDescription,
  initialFields,
  initialSteps,
}: {
  workflowId?: number;
  locked: boolean;
  users: PublicUser[];
  initialName: string;
  initialDescription: string;
  initialFields: FieldDraft[];
  initialSteps: StepDraft[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [fields, setFields] = useState<FieldDraft[]>(initialFields);
  const [steps, setSteps] = useState<StepDraft[]>(initialSteps);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function addField() {
    setFields((current) => [
      ...current,
      { uid: `field-${Date.now()}`, label: "", fieldType: "text", required: true, options: "" },
    ]);
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      { uid: `step-${Date.now()}`, name: "", approveMode: "any", approverIds: [] },
    ]);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const input: WorkflowInput = {
      id: workflowId,
      name,
      description,
      fields: fields.map((field) => ({
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        options: field.fieldType === "select" ? splitOptions(field.options) : [],
      })),
      steps: steps.map((step) => ({
        name: step.name,
        approveMode: step.approveMode,
        approverIds: step.approverIds,
      })),
    };
    const result = await saveWorkflowAction(input);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push("/admin/workflows?saved=1");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {locked ? (
        <div className="flash flash-ok">已有人发起过这个流程，表单和节点保持不动。名称和说明仍可修改。需要新结构时，请新建一个流程。</div>
      ) : null}
      {error ? <div className="flash flash-bad">{error}</div> : null}
      <section className="card grid gap-4">
        <label>
          <span className="label">流程名称</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required />
        </label>
        <label>
          <span className="label">说明</span>
          <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </label>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">表单字段</h2>
          {locked ? null : (
            <button type="button" className="btn btn-ghost" onClick={addField}>
              添加字段
            </button>
          )}
        </div>
        <div className="grid gap-4">
          {fields.map((field, index) => (
            <div key={field.uid} className="grid gap-3 rounded-2xl bg-mist p-3 md:grid-cols-[1.2fr_0.8fr_auto]">
              <label>
                <span className="label">字段 {index + 1}</span>
                <input
                  className="input"
                  value={field.label}
                  disabled={locked}
                  placeholder="例如：天数"
                  onChange={(event) =>
                    setFields((current) => current.map((item) => (item.uid === field.uid ? { ...item, label: event.target.value } : item)))
                  }
                />
              </label>
              <label>
                <span className="label">类型</span>
                <select
                  className="select"
                  value={field.fieldType}
                  disabled={locked}
                  onChange={(event) =>
                    setFields((current) =>
                      current.map((item) =>
                        item.uid === field.uid ? { ...item, fieldType: event.target.value as FieldType } : item,
                      ),
                    )
                  }
                >
                  {fieldTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-3 pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-teal"
                    checked={field.required}
                    disabled={locked}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((item) => (item.uid === field.uid ? { ...item, required: event.target.checked } : item)),
                      )
                    }
                  />
                  必填
                </label>
                {locked || fields.length === 1 ? null : (
                  <button
                    type="button"
                    className="text-sm text-rose"
                    onClick={() => setFields((current) => current.filter((item) => item.uid !== field.uid))}
                  >
                    删除
                  </button>
                )}
              </div>
              {field.fieldType === "select" ? (
                <label className="md:col-span-3">
                  <span className="label">选项，用逗号分隔</span>
                  <input
                    className="input"
                    value={field.options}
                    disabled={locked}
                    placeholder="年假，事假，病假"
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((item) => (item.uid === field.uid ? { ...item, options: event.target.value } : item)),
                      )
                    }
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">审批节点</h2>
            <p className="mt-1 text-sm text-muted">按从上到下的顺序流转。或签是任一人处理即可，会签需要全员通过。</p>
          </div>
          {locked ? null : (
            <button type="button" className="btn btn-ghost" onClick={addStep}>
              添加节点
            </button>
          )}
        </div>
        <div className="grid gap-4">
          {steps.map((step, index) => (
            <div key={step.uid} className="rounded-2xl bg-mist p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <label>
                  <span className="label">节点 {index + 1}</span>
                  <input
                    className="input"
                    value={step.name}
                    disabled={locked}
                    placeholder="例如：组长审批"
                    onChange={(event) =>
                      setSteps((current) => current.map((item) => (item.uid === step.uid ? { ...item, name: event.target.value } : item)))
                    }
                  />
                </label>
                <label>
                  <span className="label">方式</span>
                  <select
                    className="select"
                    value={step.approveMode}
                    disabled={locked}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((item) =>
                          item.uid === step.uid ? { ...item, approveMode: event.target.value as ApproveMode } : item,
                        ),
                      )
                    }
                  >
                    <option value="any">或签</option>
                    <option value="all">会签</option>
                  </select>
                </label>
                <div className="flex items-end pb-2">
                  {locked || steps.length === 1 ? null : (
                    <button
                      type="button"
                      className="text-sm text-rose"
                      onClick={() => setSteps((current) => current.filter((item) => item.uid !== step.uid))}
                    >
                      删除节点
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {users.map((user) => {
                  const checked = step.approverIds.includes(user.id);
                  return (
                    <label key={user.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="accent-teal"
                        checked={checked}
                        disabled={locked}
                        onChange={() =>
                          setSteps((current) =>
                            current.map((item) => {
                              if (item.uid !== step.uid) return item;
                              return {
                                ...item,
                                approverIds: checked
                                  ? item.approverIds.filter((id) => id !== user.id)
                                  : [...item.approverIds, user.id],
                              };
                            }),
                          )
                        }
                      />
                      {user.displayName}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "保存中…" : locked ? "保存名称和说明" : "保存流程"}
        </button>
        <Link href="/admin/workflows" className="btn btn-ghost">
          返回
        </Link>
      </div>
    </form>
  );
}
