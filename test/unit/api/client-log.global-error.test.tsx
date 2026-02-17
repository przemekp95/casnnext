import { fireEvent, render, screen } from "@testing-library/react";
import GlobalError from "@/app/api/client-log/global-error";

describe("client global error boundary", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders error details and triggers reset callback", () => {
    const reset = jest.fn();
    render(<GlobalError error={new Error("Test failure")} reset={reset} />);

    expect(screen.getByText("Ups! Coś poszło nie tak.")).toBeInTheDocument();
    expect(screen.getByText("Test failure")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
