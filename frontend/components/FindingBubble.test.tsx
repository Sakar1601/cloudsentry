import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FindingBubble from "./FindingBubble";

describe("FindingBubble", () => {
  it("renders the finding text at the given position", () => {
    render(<FindingBubble agentId="cost" text="Idle instance costing $12/week." x={50} y={40} />);

    const bubble = screen.getByTestId("finding-bubble-cost");
    expect(bubble).toHaveTextContent("Idle instance costing $12/week.");
    expect(bubble.style.left).toBe("50px");
    expect(bubble.style.top).toBe("40px");
  });
});
