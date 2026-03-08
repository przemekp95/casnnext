import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const getAnalysisBySlugMock = jest.fn();
const getAnalysesMock = jest.fn();

jest.mock("@/lib/analyses", () => ({
  getAnalyses: (...args: unknown[]) => getAnalysesMock(...args),
  getAnalysisBySlug: (...args: unknown[]) => getAnalysisBySlugMock(...args),
}));

jest.mock("next/script", () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

jest.mock("@/components/ArticleLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

jest.mock("@/components/mdx/MDXContent", () => ({
  __esModule: true,
  default: ({ source }: { source: string }) => <div data-testid="mdx-source">{source}</div>,
}));

describe("Analysis page Strapi media handling", () => {
  beforeEach(() => {
    getAnalysesMock.mockResolvedValue([]);
    getAnalysisBySlugMock.mockResolvedValue({
      id: "1",
      slug: "test-analysis",
      title: "Test Analysis",
      contentMdx: '<img src="/uploads/sample.png" alt="Sample" />',
      author: { name: "Test Author" },
    });
  });

  it("rewrites /uploads media paths to /cms/uploads before MDX rendering", async () => {
    const { default: AnalysisPage } = await import("@/app/analizy/[slug]/page");
    const jsx = await AnalysisPage({ params: Promise.resolve({ slug: "test-analysis" }) });
    render(jsx);

    expect(screen.getByTestId("mdx-source")).toHaveTextContent('/cms/uploads/sample.png');
  });
});
