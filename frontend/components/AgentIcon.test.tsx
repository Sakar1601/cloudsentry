import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AgentIcon from "./AgentIcon";

describe("AgentIcon", () => {
  it("renders a labeled marker at the given position", () => {
    render(<AgentIcon agentId="cost" x={120} y={80} />);

    const icon = screen.getByTestId("agent-icon-cost");
    expect(icon).toHaveTextContent("Cost");
    expect(icon.style.left).toBe("120px");
    expect(icon.style.top).toBe("80px");
  });

  it("falls back to the raw agent id when unknown", () => {
    render(<AgentIcon agentId="mystery" x={0} y={0} />);

    expect(screen.getByTestId("agent-icon-mystery")).toHaveTextContent("mystery");
  });
});
