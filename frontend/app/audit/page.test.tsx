import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuditPage from "./page";

describe("AuditPage", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      json: async () => [
        {
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
        },
      ],
    })) as unknown as typeof fetch;
  });

  it("fetches and renders actions from GET /actions", async () => {
    render(<AuditPage />);

    await waitFor(() => expect(screen.getByText("stop_ec2_instance")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions");
  });
});
