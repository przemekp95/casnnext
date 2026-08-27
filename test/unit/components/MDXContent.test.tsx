import { render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef, ComponentType } from "react";
import MDXContent from "@/components/mdx/MDXContent";

type MdxComponentMap = {
  img?: ComponentType<ComponentPropsWithoutRef<"img">>;
  Image?: ComponentType<ComponentPropsWithoutRef<"img">>;
  h1?: ComponentType<ComponentPropsWithoutRef<"h1">>;
};

// Mock MDXRemote since it's hard to test directly
jest.mock("next-mdx-remote/rsc", () => ({
  MDXRemote: ({ source, components }: { source: string; components?: MdxComponentMap }) => {
    const Image = components?.Image;
    const Img = components?.img;
    const Heading = components?.h1;

    return (
      <div data-testid="mdx-remote">
        {source}
        {Img ? <Img src="/images/lowercase-mdx.webp" alt="Lowercase MDX image" /> : null}
        {Image ? <Image src="/images/pascalcase-mdx.webp" alt="PascalCase MDX image" /> : null}
        {Heading ? <Heading>MDX heading</Heading> : null}
      </div>
    );
  },
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

  it("routes MDX images and headings through the supplied component map", () => {
    render(<MDXContent source="# MDX heading" />);

    expect(screen.getByRole("img", { name: "Lowercase MDX image" })).toHaveAttribute(
      "src",
      "/images/lowercase-mdx.webp",
    );
    expect(screen.getByRole("img", { name: "PascalCase MDX image" })).toHaveAttribute(
      "src",
      "/images/pascalcase-mdx.webp",
    );
    expect(screen.getByRole("heading", { level: 2, name: "MDX heading" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "MDX heading" })).not.toBeInTheDocument();
  });
});
