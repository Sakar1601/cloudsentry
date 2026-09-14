import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PendingAction } from "@/lib/types";

import AuditTable from "./AuditTable";

const action: PendingAction = {
  id: "action-1",
  agent_id: "cost",
  node_id: "ec2:i-1",
  tool_name: "stop_ec2_instance",
  params: {},
  proposed_reasoning: null,
  status: "approved",
  created_at: "2026-09-14T00:00:00",
  resolved_at: "2026-09-14T00:05:00",
  result: null,
};

describe("AuditTable", () => {
  it("renders one row per action", () => {
    render(<AuditTable actions={[action]} />);

    expect(screen.getByText("stop_ec2_instance")).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  it("renders an empty state when there are no actions", () => {
    render(<AuditTable actions={[]} />);

    expect(screen.getByText("No actions have been proposed yet.")).toBeInTheDocument();
  });
});
