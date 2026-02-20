import { normalizeCmsMdxMediaPaths } from "@/lib/cms/mdx-media";

describe("normalizeCmsMdxMediaPaths", () => {
  it("rewrites HTML media attributes from /uploads to /cms/uploads", () => {
    const source = '<img src="/uploads/chart.png" alt="chart" /><a href="/uploads/doc.pdf">PDF</a>';
    const normalized = normalizeCmsMdxMediaPaths(source);

    expect(normalized).toContain('src="/cms/uploads/chart.png"');
    expect(normalized).toContain('href="/cms/uploads/doc.pdf"');
  });

  it("rewrites Markdown links and images from /uploads to /cms/uploads", () => {
    const source = "![Alt](/uploads/a.png)\n\n[Plik](/uploads/b.pdf)";
    const normalized = normalizeCmsMdxMediaPaths(source);

    expect(normalized).toContain("![Alt](/cms/uploads/a.png)");
    expect(normalized).toContain("[Plik](/cms/uploads/b.pdf)");
  });

  it("keeps non-Strapi paths intact", () => {
    const source = '<img src="/images/logo.jpg" alt="logo" />\n![Ok](/cms/uploads/x.png)';
    const normalized = normalizeCmsMdxMediaPaths(source);

    expect(normalized).toContain('src="/images/logo.jpg"');
    expect(normalized).toContain("![Ok](/cms/uploads/x.png)");
  });
});
