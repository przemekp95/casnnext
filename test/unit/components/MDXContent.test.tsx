import { render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef, ComponentType } from "react";
import Chart from "@/components/charts/Chart";
import Map from "@/components/maps/Map";
import MDXContent from "@/components/mdx/MDXContent";

type MdxComponentMap = {
  img?: ComponentType<ComponentPropsWithoutRef<"img">>;
  Image?: ComponentType<ComponentPropsWithoutRef<"img">>;
  h1?: ComponentType<ComponentPropsWithoutRef<"h1">>;
  Chart?: typeof Chart;
  Map?: typeof Map;
};

let mockMdxComponents: MdxComponentMap | undefined;

function requireMdxImageComponent(name: "img" | "Image") {
  const component = mockMdxComponents?.[name];

  if (!component) {
    throw new Error(`MDX component map is missing ${name}`);
  }

  return component;
}

// Mock MDXRemote since it's hard to test directly
jest.mock("next-mdx-remote/rsc", () => ({
  MDXRemote: ({ source, components }: { source: string; components?: MdxComponentMap }) => {
    mockMdxComponents = components;
    const Image = components?.Image;
    const Img = components?.img;
    const Heading = components?.h1;

    return (
      <div data-testid="mdx-remote">
        {source}
        {Img ? <Img src="/images/lowercase-mdx.webp" alt="Lowercase MDX image" width={80} height={60} /> : null}
        {Image ? <Image src="/images/pascalcase-mdx.webp" alt="PascalCase MDX image" width={80} height={60} /> : null}
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

  it("forwards valid MDX dimensions and remaining image attributes through SafeImage", () => {
    render(<MDXContent source="MDX image adapter" />);

    const MdxImage = requireMdxImageComponent("img");
    render(
      <MdxImage
        src="/images/mdx-dimensions.webp"
        alt="MDX dimensions"
        width="80"
        height="60"
        className="mdx-image"
        data-testid="mdx-image-dimensions"
        loading="eager"
        srcSet="/images/mdx-dimensions-2x.webp 2x"
      />,
    );

    const image = screen.getByRole("img", { name: "MDX dimensions" });
    expect(image).toHaveAttribute("src", "/images/mdx-dimensions.webp");
    expect(image).toHaveAttribute("alt", "MDX dimensions");
    expect(image).toHaveAttribute("width", "80");
    expect(image).toHaveAttribute("height", "60");
    expect(image).toHaveClass("mdx-image");
    expect(image).toHaveAttribute("data-testid", "mdx-image-dimensions");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).not.toHaveAttribute("srcset");
  });

  it.each([
    ["missing dimensions", undefined, undefined],
    ["width only", 80, undefined],
    ["height only", undefined, 60],
    ["CSS width", "80px", "60"],
    ["whitespace width", " 80", "60"],
    ["scientific width", "8e1", "60"],
    ["hexadecimal width", "0x50", "60"],
    ["signed width", "+80", "60"],
    ["negative width", -1, 60],
    ["non-finite width", Number.POSITIVE_INFINITY, 60],
  ])("uses the paired 0x0 auto fallback for %s", (_name, width, height) => {
    render(<MDXContent source="MDX fallback dimensions" />);

    const MdxImage = requireMdxImageComponent("Image");
    render(
      <MdxImage
        src={`/images/mdx-${_name.replaceAll(" ", "-")}.webp`}
        alt={`MDX ${_name}`}
        width={width}
        height={height}
      />,
    );

    const image = screen.getByRole("img", { name: `MDX ${_name}` });
    expect(image).toHaveAttribute("width", "0");
    expect(image).toHaveAttribute("height", "0");
    expect(image).toHaveStyle({ width: "auto", height: "auto" });
  });

  it.each([
    ["numeric zero", 0, 0],
    ["digit strings", "080", "060"],
  ])("preserves paired valid dimensions for %s", (_name, width, height) => {
    render(<MDXContent source="MDX valid dimensions" />);

    const MdxImage = requireMdxImageComponent("img");
    render(<MdxImage src={`/images/mdx-${_name}.webp`} alt={`MDX ${_name}`} width={width} height={height} />);

    const image = screen.getByRole("img", { name: `MDX ${_name}` });
    expect(image).toHaveAttribute("width", String(width));
    expect(image).toHaveAttribute("height", String(height));
    expect(image).not.toHaveStyle({ width: "auto", height: "auto" });
  });

  it("passes the production Chart and Map entries to MDX", () => {
    render(<MDXContent source="Chart and map content" />);

    expect(mockMdxComponents?.Chart).toBe(Chart);
    expect(mockMdxComponents?.Map).toBe(Map);
  });
});
