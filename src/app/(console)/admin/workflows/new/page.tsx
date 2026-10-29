import { WorkflowEditor } from "@/components/workflow-editor";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/queries";

export const metadata = { title: "新建流程" };

export default async function NewWorkflowPage() {
  await requireAdmin();
  const users = listUsers();

  return (
    <>
      <PageHeader title="新建流程" description="先定表单，再按顺序指定每一级由谁审批。" />
      <WorkflowEditor
        locked={false}
        users={users}
        initialName=""
        initialDescription=""
        initialFields={[{ uid: "field-1", label: "", fieldType: "text", required: true, options: "" }]}
        initialSteps={[{ uid: "step-1", name: "", approveMode: "any", approverIds: [] }]}
      />
    </>
  );
}
