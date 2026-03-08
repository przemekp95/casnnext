/** @jest-environment node */

const revalidateTagMock = jest.fn();
const revalidatePathMock = jest.fn();
const fetchCmsAnalysisByIdMock = jest.fn();
const fetchCmsAuthorByIdMock = jest.fn();
const fetchCmsAuthorBySlugMock = jest.fn();
const fetchCmsIssueByIdMock = jest.fn();
const fetchCmsAuthorsMock = jest.fn();
const fetchCmsAnalysesMock = jest.fn();
const fetchCmsIssuesMock = jest.fn();

const authorRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const analysisRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const issueRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const appDataSourceMock = {
  isInitialized: true,
  initialize: jest.fn(),
  getRepository: jest.fn(),
  query: jest.fn(),
};

jest.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

jest.mock("@/lib/cms/strapi-client", () => ({
  fetchCmsAnalysisById: (...args: unknown[]) => fetchCmsAnalysisByIdMock(...args),
  fetchCmsAuthorById: (...args: unknown[]) => fetchCmsAuthorByIdMock(...args),
  fetchCmsAuthorBySlug: (...args: unknown[]) => fetchCmsAuthorBySlugMock(...args),
  fetchCmsIssueById: (...args: unknown[]) => fetchCmsIssueByIdMock(...args),
  fetchCmsAuthors: (...args: unknown[]) => fetchCmsAuthorsMock(...args),
  fetchCmsAnalyses: (...args: unknown[]) => fetchCmsAnalysesMock(...args),
  fetchCmsIssues: (...args: unknown[]) => fetchCmsIssuesMock(...args),
}));

jest.mock("@/lib/db.shared", () => ({
  AppDataSource: appDataSourceMock,
}));

describe("lib/server/cms-sync", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    appDataSourceMock.isInitialized = true;
    appDataSourceMock.query.mockResolvedValue([]);
    appDataSourceMock.getRepository.mockImplementation((schema: { options?: { name?: string } }) => {
      switch (schema.options?.name) {
        case "Author":
          return authorRepository;
        case "Analysis":
          return analysisRepository;
        case "IssueCollection":
          return issueRepository;
        default:
          throw new Error(`Unknown repository requested: ${schema.options?.name}`);
      }
    });

    authorRepository.findOne.mockResolvedValue(null);
    authorRepository.find.mockResolvedValue([]);
    authorRepository.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 501 }));

    analysisRepository.findOne.mockResolvedValue(null);
    analysisRepository.find.mockResolvedValue([]);
    analysisRepository.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 901 }));

    issueRepository.findOne.mockResolvedValue(null);
    issueRepository.find.mockResolvedValue([]);
    issueRepository.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 1201 }));
  });

  it("syncs a new Strapi analysis with media-bearing MDX and a new author into DB", async () => {
    fetchCmsAnalysisByIdMock.mockResolvedValue({
      id: 77,
      legacyId: null,
      slug: "nowy-mdx",
      title: "Nowy MDX",
      lead: "Lead testowy",
      description: "Opis testowy",
      date: "2026-03-07",
      category: "analizy",
      contentMdx: '![Hero](/uploads/hero.png)\n\nTreść nowego artykułu.',
      sourceHash: "analysis-hash",
      publishedAt: "2026-03-07T10:15:00.000Z",
      author: {
        id: 31,
        legacyId: null,
        slug: "nowy-autor",
        name: "Nowy Autor",
        displayName: "Nowy Autor",
        bio: "Biogram nowego autora",
        avatarUrl: "https://cms.example.com/cms/uploads/nowy-autor.png",
        legacyImgPath: null,
        sourceHash: "author-hash",
        publishedAt: "2026-03-07T10:10:00.000Z",
      },
    });

    const { syncCmsEntryById } = await import("@/lib/server/cms-sync");
    const saved = await syncCmsEntryById("analysis", 77);

    expect(fetchCmsAnalysisByIdMock).toHaveBeenCalledWith(77, { withToken: true });

    expect(authorRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "nowy-autor",
        name: "Nowy Autor",
        displayName: "Nowy Autor",
        img: "https://cms.example.com/cms/uploads/nowy-autor.png",
        bio: "Biogram nowego autora",
        strapiId: 31,
        sourceHash: "author-hash",
        publishedAt: new Date("2026-03-07T10:10:00.000Z"),
      }),
    );

    expect(analysisRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "nowy-mdx",
        title: "Nowy MDX",
        authorId: 501,
        lead: "Lead testowy",
        description: "Opis testowy",
        date: "2026-03-07",
        category: "analizy",
        strapiId: 77,
        sourceHash: "analysis-hash",
        publishedAt: new Date("2026-03-07T10:15:00.000Z"),
      }),
    );

    const savedAnalysisPayload = analysisRepository.save.mock.calls[0]?.[0] as { contentMdx?: string };
    expect(savedAnalysisPayload.contentMdx).toContain('title: Nowy MDX');
    expect(savedAnalysisPayload.contentMdx).toContain('lead: Lead testowy');
    expect(savedAnalysisPayload.contentMdx).toContain('description: Opis testowy');
    expect(savedAnalysisPayload.contentMdx).toContain("date: '2026-03-07'");
    expect(savedAnalysisPayload.contentMdx).toContain('category: analizy');
    expect(savedAnalysisPayload.contentMdx).toContain('![Hero](/uploads/hero.png)');
    expect(savedAnalysisPayload.contentMdx).toContain('Treść nowego artykułu.');

    expect(revalidateTagMock).toHaveBeenCalledWith("authors", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("analyses", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("articles", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("sitemap", "max");
    expect(revalidatePathMock).toHaveBeenCalledWith("/analizy");
    expect(revalidatePathMock).toHaveBeenCalledWith("/analizy/nowy-mdx");
    expect(revalidatePathMock).toHaveBeenCalledWith("/autor/nowy-autor");
    expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml");
    expect(saved).toEqual(expect.objectContaining({ slug: "nowy-mdx", id: 901 }));
  });

  it("resolves a missing analysis author through Strapi relation tables", async () => {
    fetchCmsAnalysisByIdMock.mockResolvedValue({
      id: 88,
      legacyId: null,
      slug: "bez-autora-w-payload",
      title: "Bez autora w payload",
      lead: "Lead testowy",
      description: "Opis testowy",
      date: "2026-03-09",
      category: "analizy",
      contentMdx: "Treść artykułu.",
      sourceHash: "analysis-no-author",
      publishedAt: "2026-03-09T11:00:00.000Z",
      author: null,
    });
    appDataSourceMock.query.mockResolvedValue([{ slug: "nowy-autor" }]);
    fetchCmsAuthorBySlugMock.mockResolvedValue({
      id: 31,
      legacyId: null,
      slug: "nowy-autor",
      name: "Nowy Autor",
      displayName: "Nowy Autor",
      bio: "Biogram nowego autora",
      avatarUrl: "https://cms.example.com/uploads/nowy-autor.png",
      legacyImgPath: null,
      sourceHash: "author-hash",
      publishedAt: "2026-03-09T10:55:00.000Z",
    });

    const { syncCmsEntryById } = await import("@/lib/server/cms-sync");
    const saved = await syncCmsEntryById("analysis", 88);

    expect(appDataSourceMock.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM cms_analyses ca"),
      [88],
    );
    expect(fetchCmsAuthorBySlugMock).toHaveBeenCalledWith("nowy-autor");
    expect(saved).toEqual(expect.objectContaining({ slug: "bez-autora-w-payload", id: 901 }));
  });

  it("clears an existing issue cover when it is removed in Strapi", async () => {
    issueRepository.findOne
      .mockResolvedValueOnce({
        id: 1201,
        year: 2026,
        title: "Zeszyt Analiz 2026",
        fileUrl: "https://casn.pl/uploads/zeszyt-analiz-2026.pdf",
        coverUrl: "https://casn.pl/uploads/zeszyt-analiz-2026.webp",
        strapiId: 2,
        publishedAt: new Date("2026-03-07T22:10:13.278Z"),
      });

    fetchCmsIssueByIdMock.mockResolvedValue({
      id: 2,
      year: 2026,
      title: "Zeszyt Analiz 2026",
      fileUrl: "https://casn.pl/uploads/zeszyt-analiz-2026.pdf",
      coverUrl: null,
      publishedAt: "2026-03-07T22:19:37.484Z",
    });

    const { syncCmsEntryById } = await import("@/lib/server/cms-sync");
    const saved = await syncCmsEntryById("issue", 2);

    expect(fetchCmsIssueByIdMock).toHaveBeenCalledWith(2, { withToken: true });
    expect(issueRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1201,
        year: 2026,
        title: "Zeszyt Analiz 2026",
        fileUrl: "https://casn.pl/uploads/zeszyt-analiz-2026.pdf",
        coverUrl: null,
        strapiId: 2,
        publishedAt: new Date("2026-03-07T22:19:37.484Z"),
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("issues", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("sitemap", "max");
    expect(revalidatePathMock).toHaveBeenCalledWith("/zbiory");
    expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml");
    expect(saved).toEqual(expect.objectContaining({ id: 1201, year: 2026, coverUrl: null }));
  });

  it("clears an existing author image when it is removed in Strapi", async () => {
    authorRepository.findOne.mockResolvedValueOnce({
      id: 501,
      slug: "autor-z-cms",
      name: "Autor z CMS",
      displayName: "Autor z CMS",
      img: "https://casn.pl/uploads/autor-z-cms.png",
      bio: "Biogram autora",
      strapiId: 31,
      publishedAt: new Date("2026-03-07T10:10:00.000Z"),
    });

    fetchCmsAuthorByIdMock.mockResolvedValue({
      id: 31,
      legacyId: null,
      slug: "autor-z-cms",
      name: "Autor z CMS",
      displayName: "Autor z CMS",
      bio: "Biogram autora",
      avatarUrl: null,
      legacyImgPath: null,
      sourceHash: "author-no-avatar",
      publishedAt: "2026-03-07T10:20:00.000Z",
    });

    const { syncCmsEntryById } = await import("@/lib/server/cms-sync");
    const saved = await syncCmsEntryById("author", 31);

    expect(fetchCmsAuthorByIdMock).toHaveBeenCalledWith(31, { withToken: true });
    expect(authorRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 501,
        slug: "autor-z-cms",
        img: null,
        bio: "Biogram autora",
        strapiId: 31,
        publishedAt: new Date("2026-03-07T10:20:00.000Z"),
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("authors", "max");
    expect(saved).toEqual(expect.objectContaining({ id: 501, slug: "autor-z-cms", img: null }));
  });

  it("clears an existing issue file when it is removed in Strapi", async () => {
    issueRepository.findOne.mockResolvedValueOnce({
      id: 1201,
      year: 2026,
      title: "Zeszyt Analiz 2026",
      fileUrl: "https://casn.pl/uploads/zeszyt-analiz-2026.pdf",
      coverUrl: null,
      strapiId: 2,
      publishedAt: new Date("2026-03-07T22:10:13.278Z"),
    });

    fetchCmsIssueByIdMock.mockResolvedValue({
      id: 2,
      year: 2026,
      title: "Zeszyt Analiz 2026",
      fileUrl: null,
      coverUrl: null,
      publishedAt: "2026-03-07T22:29:00.000Z",
    });

    const { syncCmsEntryById } = await import("@/lib/server/cms-sync");
    const saved = await syncCmsEntryById("issue", 2);

    expect(fetchCmsIssueByIdMock).toHaveBeenCalledWith(2, { withToken: true });
    expect(issueRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1201,
        year: 2026,
        title: "Zeszyt Analiz 2026",
        fileUrl: "#",
        coverUrl: null,
        strapiId: 2,
        publishedAt: new Date("2026-03-07T22:29:00.000Z"),
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("issues", "max");
    expect(saved).toEqual(expect.objectContaining({ id: 1201, year: 2026, fileUrl: "#" }));
  });
});
