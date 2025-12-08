import { render, screen } from "@testing-library/react";
import MDXContent from "@/components/mdx/MDXContent";

// Mock MDXRemote since it's hard to test directly
jest.mock("next-mdx-remote/rsc", () => ({
  MDXRemote: ({ source }: { source: string }) => <div data-testid="mdx-remote">{source}</div>,
}));

describe("MDXContent", () => {
  it("renders source content", () => {
    const source = "# Hello World\n\nThis is markdown.";
    render(<MDXContent source={source} />);

    expect(screen.getByTestId("mdx-remote")).toHaveTextContent("# Hello World");
  });

  it("renders with different source", () => {
    const source = "## Subtitle\n\nSome content.";
    render(<MDXContent source={source} />);

    expect(screen.getByTestId("mdx-remote")).toHaveTextContent("## Subtitle");
  });

  it("has correct component structure", () => {
    const source = "test";
    render(<MDXContent source={source} />);

    const element = screen.getByTestId("mdx-remote");
    expect(element).toBeInTheDocument();
  });
});
