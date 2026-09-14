import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home page (scaffold)", () => {
  it("renders a placeholder heading", () => {
    render(<Home />);

    expect(screen.getByText("Cloudsentry")).toBeInTheDocument();
  });
});
