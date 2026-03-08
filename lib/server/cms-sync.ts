import crypto from "crypto";
import matter from "gray-matter";
import { revalidatePath, revalidateTag } from "next/cache";
import { AppDataSource } from "@/lib/db.shared";
import {
  fetchCmsAnalyses,
  fetchCmsAnalysisById,
  fetchCmsAuthorById,
  fetchCmsAuthorBySlug,
  fetchCmsAuthors,
  fetchCmsIssueById,
  fetchCmsIssues,
} from "@/lib/cms/strapi-client";
import type { CmsAnalysis, CmsAuthor, CmsIssue } from "@/lib/cms/types";
import { AnalysisSchema, AuthorSchema, IssueCollectionSchema } from "@/lib/entities";
import type { AnalysisEntity } from "@/lib/entities/Analysis";
import type { AuthorEntity } from "@/lib/entities/Author";
import type { IssueCollectionEntity } from "@/lib/entities/IssueCollection";

export type CmsContentKind = "analysis" | "author" | "issue";

type SyncReference = {
  strapiId?: number | null;
  slug?: string | null;
  year?: number | null;
  authorSlug?: string | null;
};

type SyncSummary = {
  authors: number;
  analyses: number;
  issues: number;
  unpublished: number;
};

function hashObject(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function toPublishedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildStoredAnalysisContent(analysis: CmsAnalysis): string {
  const raw = analysis.contentMdx || "";
  if (raw.trim().startsWith("---")) {
    return raw;
  }

  const frontmatter: Record<string, string> = { title: analysis.title };
  if (analysis.lead) frontmatter.lead = analysis.lead;
  if (analysis.description) frontmatter.description = analysis.description;
  if (analysis.date) frontmatter.date = analysis.date;
  if (analysis.category) frontmatter.category = analysis.category;

  return matter.stringify(raw, frontmatter);
}

function tryRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    // Static generation store is not always available in tests/scripts.
  }
}

function tryRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Static generation store is not always available in tests/scripts.
  }
}

function revalidateKind(kind: CmsContentKind, ref: SyncReference = {}): void {
  tryRevalidateTag("sitemap");

  if (kind === "analysis") {
    tryRevalidateTag("analyses");
    tryRevalidateTag("articles");
    tryRevalidatePath("/analizy");
    tryRevalidatePath("/sitemap.xml");
    if (ref.slug) tryRevalidatePath(`/analizy/${ref.slug}`);
    if (ref.authorSlug) tryRevalidatePath(`/autor/${ref.authorSlug}`);
    return;
  }

  if (kind === "author") {
    tryRevalidateTag("authors");
    tryRevalidateTag("analyses");
    tryRevalidateTag("articles");
    tryRevalidatePath("/autorzy");
    tryRevalidatePath("/analizy");
    tryRevalidatePath("/sitemap.xml");
    if (ref.slug) tryRevalidatePath(`/autor/${ref.slug}`);
    return;
  }

  tryRevalidateTag("issues");
  tryRevalidatePath("/zbiory");
  tryRevalidatePath("/sitemap.xml");
}

async function getDataSource() {
  if (!AppDataSource) {
    throw new Error("Database is not configured");
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  return AppDataSource;
}

async function findAuthorByCmsRef(author: CmsAuthor) {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(AuthorSchema);

  if (author.id) {
    const byStrapiId = await repository.findOne({ where: { strapiId: author.id } });
    if (byStrapiId) return byStrapiId as AuthorEntity;
  }

  if (author.legacyId !== null) {
    const byLegacyId = await repository.findOne({ where: { id: author.legacyId } });
    if (byLegacyId) return byLegacyId as AuthorEntity;
  }

  const bySlug = await repository.findOne({ where: { slug: author.slug } });
  return (bySlug as AuthorEntity | null) ?? null;
}

async function findAnalysisByCmsRef(analysis: CmsAnalysis) {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(AnalysisSchema);

  if (analysis.id) {
    const byStrapiId = await repository.findOne({ where: { strapiId: analysis.id } });
    if (byStrapiId) return byStrapiId as AnalysisEntity;
  }

  if (analysis.legacyId !== null) {
    const byLegacyId = await repository.findOne({ where: { id: analysis.legacyId } });
    if (byLegacyId) return byLegacyId as AnalysisEntity;
  }

  const bySlug = await repository.findOne({ where: { slug: analysis.slug } });
  return (bySlug as AnalysisEntity | null) ?? null;
}

async function findIssueByCmsRef(issue: CmsIssue) {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(IssueCollectionSchema);

  const byStrapiId = await repository.findOne({ where: { strapiId: issue.id } });
  if (byStrapiId) return byStrapiId as IssueCollectionEntity;

  const byYear = await repository.findOne({ where: { year: issue.year } });
  return (byYear as IssueCollectionEntity | null) ?? null;
}

async function resolveAnalysisAuthorFallback(analysisId: number): Promise<CmsAuthor | null> {
  const dataSource = await getDataSource();
  const rows = await dataSource.query(
    `
      SELECT au.slug AS slug
      FROM cms_analyses ca
      INNER JOIN cms_analyses_author_lnk cal
        ON cal.analysis_id = ca.id
      INNER JOIN cms_authors au
        ON au.id = cal.author_id
      WHERE ca.id = ?
        AND au.published_at IS NOT NULL
      ORDER BY cal.analysis_ord DESC, au.id DESC
      LIMIT 1
    `,
    [analysisId],
  );

  const slug = typeof rows?.[0]?.slug === "string" ? rows[0].slug : null;
  if (!slug) return null;
  return fetchCmsAuthorBySlug(slug);
}

export async function upsertCmsAuthor(author: CmsAuthor): Promise<AuthorEntity> {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(AuthorSchema);
  const existing = await findAuthorByCmsRef(author);

  const saved = await repository.save({
    ...existing,
    id: existing?.id ?? author.legacyId ?? undefined,
    slug: author.slug,
    name: author.name,
    displayName: author.displayName || author.name,
    img: author.avatarUrl || author.legacyImgPath || null,
    bio: author.bio ?? null,
    strapiId: author.id,
    sourceHash:
      author.sourceHash ??
      hashObject({
        slug: author.slug,
        name: author.name,
        displayName: author.displayName,
        bio: author.bio,
        img: author.avatarUrl || author.legacyImgPath || null,
      }),
    publishedAt: toPublishedDate(author.publishedAt),
  });

  revalidateKind("author", { slug: author.slug });
  return saved as AuthorEntity;
}

export async function upsertCmsAnalysis(analysis: CmsAnalysis): Promise<AnalysisEntity> {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(AnalysisSchema);
  const existing = await findAnalysisByCmsRef(analysis);
  const resolvedAuthor =
    analysis.author ?? (analysis.id ? await resolveAnalysisAuthorFallback(analysis.id) : null);
  const authorEntity = resolvedAuthor ? await upsertCmsAuthor(resolvedAuthor) : null;
  const authorId = authorEntity?.id ?? existing?.authorId;

  if (!authorId) {
    throw new Error(`Analysis ${analysis.slug} cannot be synced without an author`);
  }

  const storedContent = buildStoredAnalysisContent(analysis);
  const saved = await repository.save({
    ...existing,
    id: existing?.id ?? analysis.legacyId ?? undefined,
    title: analysis.title,
    slug: analysis.slug,
    authorId,
    lead: analysis.lead ?? null,
    description: analysis.description ?? null,
    date: analysis.date ?? null,
    category: analysis.category ?? null,
    contentMdx: storedContent,
    strapiId: analysis.id,
    sourceHash:
      analysis.sourceHash ??
      hashObject({
        slug: analysis.slug,
        title: analysis.title,
        authorId,
        lead: analysis.lead,
        description: analysis.description,
        date: analysis.date,
        category: analysis.category,
        contentMdx: storedContent,
      }),
    publishedAt: toPublishedDate(analysis.publishedAt),
  });

  revalidateKind("analysis", {
    slug: analysis.slug,
    authorSlug: resolvedAuthor?.slug ?? null,
  });
  return saved as AnalysisEntity;
}

export async function upsertCmsIssue(issue: CmsIssue): Promise<IssueCollectionEntity> {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(IssueCollectionSchema);
  const existing = await findIssueByCmsRef(issue);

  const saved = await repository.save({
    ...existing,
    id: existing?.id,
    year: issue.year,
    title: issue.title,
    fileUrl: issue.fileUrl || "#",
    coverUrl: issue.coverUrl ?? null,
    strapiId: issue.id,
    sourceHash: hashObject({
      year: issue.year,
      title: issue.title,
      fileUrl: issue.fileUrl,
      coverUrl: issue.coverUrl,
    }),
    publishedAt: toPublishedDate(issue.publishedAt),
  });

  revalidateKind("issue", { year: issue.year });
  return saved as IssueCollectionEntity;
}

async function markAuthorUnpublished(ref: SyncReference): Promise<boolean> {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(AuthorSchema);
  const existing =
    (ref.strapiId
      ? await repository.findOne({ where: { strapiId: ref.strapiId } })
      : null) ||
    (ref.slug ? await repository.findOne({ where: { slug: ref.slug } }) : null);

  if (!existing) return false;
  await repository.save({ ...(existing as AuthorEntity), publishedAt: null });
  revalidateKind("author", ref);
  return true;
}

async function markAnalysisUnpublished(ref: SyncReference): Promise<boolean> {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(AnalysisSchema);
  const existing =
    (ref.strapiId
      ? await repository.findOne({ where: { strapiId: ref.strapiId } })
      : null) ||
    (ref.slug ? await repository.findOne({ where: { slug: ref.slug } }) : null);

  if (!existing) return false;
  await repository.save({ ...(existing as AnalysisEntity), publishedAt: null });
  revalidateKind("analysis", ref);
  return true;
}

async function markIssueUnpublished(ref: SyncReference): Promise<boolean> {
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(IssueCollectionSchema);
  const existing =
    (ref.strapiId
      ? await repository.findOne({ where: { strapiId: ref.strapiId } })
      : null) ||
    (ref.year
      ? await repository.findOne({ where: { year: ref.year } })
      : null);

  if (!existing) return false;
  await repository.save({ ...(existing as IssueCollectionEntity), publishedAt: null });
  revalidateKind("issue", ref);
  return true;
}

async function markMissingPublishedRows(kind: CmsContentKind, publishedIds: Set<number>): Promise<number> {
  const dataSource = await getDataSource();

  if (kind === "author") {
    const repository = dataSource.getRepository(AuthorSchema);
    const rows = await repository.find();
    let affected = 0;

    for (const row of rows as AuthorEntity[]) {
      if (row.strapiId && !publishedIds.has(row.strapiId) && row.publishedAt) {
        await repository.save({ ...row, publishedAt: null });
        affected += 1;
      }
    }

    if (affected > 0) revalidateKind("author");
    return affected;
  }

  if (kind === "analysis") {
    const repository = dataSource.getRepository(AnalysisSchema);
    const rows = await repository.find();
    let affected = 0;

    for (const row of rows as AnalysisEntity[]) {
      if (row.strapiId && !publishedIds.has(row.strapiId) && row.publishedAt) {
        await repository.save({ ...row, publishedAt: null });
        affected += 1;
      }
    }

    if (affected > 0) revalidateKind("analysis");
    return affected;
  }

  const repository = dataSource.getRepository(IssueCollectionSchema);
  const rows = await repository.find();
  let affected = 0;

  for (const row of rows as IssueCollectionEntity[]) {
    if (row.strapiId && !publishedIds.has(row.strapiId) && row.publishedAt) {
      await repository.save({ ...row, publishedAt: null });
      affected += 1;
    }
  }

  if (affected > 0) revalidateKind("issue");
  return affected;
}

export async function syncAllCmsContent(): Promise<SyncSummary> {
  const [authors, analyses, issues] = await Promise.all([
    fetchCmsAuthors(),
    fetchCmsAnalyses(),
    fetchCmsIssues(),
  ]);

  for (const author of authors) {
    await upsertCmsAuthor(author);
  }

  for (const analysis of analyses) {
    await upsertCmsAnalysis(analysis);
  }

  for (const issue of issues) {
    await upsertCmsIssue(issue);
  }

  const unpublishedAuthors = await markMissingPublishedRows(
    "author",
    new Set(authors.map((author) => author.id))
  );
  const unpublishedAnalyses = await markMissingPublishedRows(
    "analysis",
    new Set(analyses.map((analysis) => analysis.id))
  );
  const unpublishedIssues = await markMissingPublishedRows(
    "issue",
    new Set(issues.map((issue) => issue.id))
  );

  return {
    authors: authors.length,
    analyses: analyses.length,
    issues: issues.length,
    unpublished: unpublishedAuthors + unpublishedAnalyses + unpublishedIssues,
  };
}

export async function syncCmsEntryById(
  kind: CmsContentKind,
  id: number
): Promise<AnalysisEntity | AuthorEntity | IssueCollectionEntity | null> {
  if (kind === "author") {
    const author = await fetchCmsAuthorById(id, { withToken: true });
    if (!author) return null;
    return upsertCmsAuthor(author);
  }

  if (kind === "analysis") {
    const analysis = await fetchCmsAnalysisById(id, { withToken: true });
    if (!analysis) return null;
    return upsertCmsAnalysis(analysis);
  }

  const issue = await fetchCmsIssueById(id, { withToken: true });
  if (!issue) return null;
  return upsertCmsIssue(issue);
}

export async function unpublishCmsEntry(kind: CmsContentKind, ref: SyncReference): Promise<boolean> {
  if (kind === "author") {
    return markAuthorUnpublished(ref);
  }

  if (kind === "analysis") {
    return markAnalysisUnpublished(ref);
  }

  return markIssueUnpublished(ref);
}

export function normalizeCmsKind(value: string | null | undefined): CmsContentKind | null {
  const normalized = (value || "").toLowerCase();

  if (normalized.includes("analysis")) return "analysis";
  if (normalized.includes("author")) return "author";
  if (normalized.includes("issue")) return "issue";

  return null;
}
