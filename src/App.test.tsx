import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renderiza el estado inicial sin grabación", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /screen recorder/i })).toBeInTheDocument();
    expect(screen.getByText(/sin grabación activa/i)).toBeInTheDocument();
  });
});
