import type { PendingAction } from "./types";

type OutcomeTone = "success" | "rejected" | "error";

export interface Outcome {
  tone: OutcomeTone;
  title: string;
  detail: string;
}

const TOOL_LABELS: Record<string, string> = {
  stop_ec2_instance: "Stop instance",
  resize_ec2_instance: "Resize instance",
  tighten_iam_policy: "Tighten IAM policy",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

function whatChanged(action: PendingAction): string {
  const p = action.params as Record<string, unknown>;
  if (action.tool_name === "stop_ec2_instance") return `Instance ${p.instance_id} is being stopped.`;
  if (action.tool_name === "resize_ec2_instance")
    return `Instance ${p.instance_id} is being resized to ${p.new_instance_type}.`;
  if (action.tool_name === "tighten_iam_policy")
    return `Policy ${p.policy_name} on role ${p.role_name} was replaced with the narrower version.`;
  return "The change was applied.";
}

/** What the user should be told after clicking Approve or Reject. */
export function describeOutcome(action: PendingAction): Outcome {
  if (action.status === "rejected") {
    return {
      tone: "rejected",
      title: `Rejected: ${toolLabel(action.tool_name)}`,
      detail: "Nothing was changed and no AWS call was made. The decision is recorded in the audit log.",
    };
  }

  const result = action.result;
  if (result && result.success === false) {
    return {
      tone: "error",
      title: `Approved, but it failed: ${toolLabel(action.tool_name)}`,
      detail: `AWS did not accept the change: ${result.error ?? "unknown error"}. Nothing was modified.`,
    };
  }

  const simulated = Boolean((result?.result as { simulated?: boolean } | undefined)?.simulated);
  return {
    tone: "success",
    title: `Approved: ${toolLabel(action.tool_name)}`,
    detail: `${whatChanged(action)} ${
      simulated
        ? "Simulated here; against a live account this runs on AWS."
        : "Applied to AWS; the graph refreshes on the next poll."
    }`,
  };
}
