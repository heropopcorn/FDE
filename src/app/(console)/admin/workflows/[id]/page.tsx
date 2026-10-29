import { notFound } from "next/navigation";
import { WorkflowEditor } from "@/components/workflow-editor";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { countRequests, getWorkflow, listUsers } from "@/lib/queries";

export const metadata = { title: "编辑流程" };

export default async function EditWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const workflow = getWorkflow(Number(id));
  if (!workflow) notFound();
  const users = listUsers();

  return (
    <>
      <PageHeader eyebrow="流程配置" title={workflow.name} description="审批人可以在「AI 规则」里给这个流程单独写自动通过条件。" />
      <WorkflowEditor
        workflowId={workflow.id}
        locked={countRequests(workflow.id) > 0}
        users={users}
        initialName={workflow.name}
        initialDescription={workflow.description}
        initialFields={workflow.fields.map((field, index) => ({
          uid: `field-${index + 1}`,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          options: field.options.join("，"),
        }))}
        initialSteps={workflow.steps.map((step, index) => ({
          uid: `step-${index + 1}`,
          name: step.name,
          approveMode: step.approveMode,
          approverIds: step.approvers.map((approver) => approver.id),
        }))}
      />
    </>
  );
}
