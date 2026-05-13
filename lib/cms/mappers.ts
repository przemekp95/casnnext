import type { AnalysisDetail, AnalysisRow } from "@/types/analysis";
import type { AuthorDetail, AuthorRow } from "@/types/author";
import type { IssueCollectionRow } from "@/types/issue";
import { getStrapiPublicUrl } from "./config";
import type { CmsAnalysis, CmsAuthor, CmsIssue } from "./types";
import { createExcerpt, stripMarkdown } from "@/lib/searchUtils";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function unwrapEntity(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.attributes)) {
    return { id: value.id, ...(value.attributes as UnknownRecord) };
  }
  return value;
}

function unwrapRelation(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if ("data" in value) return value.data;
  return value;
}

function resolveMediaUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  const base = getStrapiPublicUrl().replace(/\/+$/, "");
  const normalized = value.startsWith("/") ? value : `/${value}`;

  if (base.endsWith("/cms") && normalized.startsWith("/cms/")) {
    return `${base.slice(0, -4)}${normalized}`;
  }

  return `${base}${normalized}`;
}

function mediaUrlFromField(value: unknown): string | null {
  const relation = unwrapRelation(value);
  const media = unwrapEntity(relation);
  if (!media) return null;

  const direct = toStringOrNull(media.url);
  return resolveMediaUrl(direct);
}

function stripMdxFrontmatter(source: string): string {
  if (!source.trim().startsWith("---")) return source;
  return source.replace(/^---[\s\S]*?---\s*/, "");
}

function toIsoDateOrEmpty(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

type AuthorCanonicalOverride = {
  name?: string;
  displayName?: string;
  img?: string;
  preferLegacyImage?: boolean;
};

function normalizeAcademicTitleCase(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");

  return compact
    .replace(/\bdr\.?(?=\s)/gi, "dr")
    .replace(/\badw\.?(?=\s)/gi, "adw.")
    .replace(/\bprof\.?(?=\s)/gi, "prof.");
}

const AUTHOR_CANONICAL_OVERRIDES: Record<string, AuthorCanonicalOverride> = {
  balcerowski: {
    img: "/images/placeholder.png",
    preferLegacyImage: true,
  },
  "piotr-balcerowski": {
    img: "/images/placeholder.png",
    preferLegacyImage: true,
  },
  domanska: {
    name: "prof. Agnieszka Domańska",
    displayName: "prof. Agnieszka Domańska",
    img: "/images/Domanska.png",
    preferLegacyImage: true,
  },
  "anna-domanska": {
    name: "prof. Agnieszka Domańska",
    displayName: "prof. Agnieszka Domańska",
    img: "/images/Domanska.png",
    preferLegacyImage: true,
  },
  "aldona-domanska": {
    name: "prof. Agnieszka Domańska",
    displayName: "prof. Agnieszka Domańska",
    img: "/images/Domanska.png",
    preferLegacyImage: true,
  },
  masior: {
    name: "adw. dr Michał Masior",
    displayName: "adw. dr Michał Masior",
  },
  "michal-masior": {
    name: "adw. dr Michał Masior",
    displayName: "adw. dr Michał Masior",
  },
};

function normalizeCmsAuthor(author: CmsAuthor): CmsAuthor {
  const normalizedSlug = author.slug.trim().toLowerCase();
  const override = AUTHOR_CANONICAL_OVERRIDES[normalizedSlug];
  const normalizedName = normalizeAcademicTitleCase(
    override?.name ?? author.name
  );
  const normalizedDisplayName = normalizeAcademicTitleCase(
    override?.displayName ?? override?.name ?? author.displayName
  );

  return {
    ...author,
    name: normalizedName,
    displayName: normalizedDisplayName,
    legacyImgPath: override?.img ?? author.legacyImgPath,
    avatarUrl: override?.preferLegacyImage ? null : author.avatarUrl,
  };
}

export function mapCmsAuthor(entity: unknown): CmsAuthor | null {
  const payload = unwrapEntity(entity);
  if (!payload) return null;

  const id = toNumber(payload.id);
  const slug = toStringOrNull(payload.slug);
  const name = toStringOrNull(payload.name);
  if (id === null || !slug || !name) return null;

  const displayName = toStringOrNull(payload.displayName) || name;
  const bio = toStringOrNull(payload.bio);
  const legacyId = toNumber(payload.legacyId);
  const legacyImgPath = toStringOrNull(payload.legacyImgPath);
  const sourceHash = toStringOrNull(payload.sourceHash);
  const avatarUrl = mediaUrlFromField(payload.avatar);

  return normalizeCmsAuthor({
    id,
    legacyId,
    slug,
    name,
    displayName,
    bio,
    avatarUrl,
    legacyImgPath,
    sourceHash,
    publishedAt: toStringOrNull(payload.publishedAt),
  });
}

export function mapCmsAnalysis(entity: unknown): CmsAnalysis | null {
  const payload = unwrapEntity(entity);
  if (!payload) return null;

  const id = toNumber(payload.id);
  const slug = toStringOrNull(payload.slug);
  const title = toStringOrNull(payload.title);
  if (id === null || !slug || !title) return null;

  const author = mapCmsAuthor(unwrapRelation(payload.author));
  const contentMdx =
    toStringOrNull(payload.contentMdx) ||
    toStringOrNull(payload.content) ||
    "";

  return {
    id,
    legacyId: toNumber(payload.legacyId),
    slug,
    title,
    lead: toStringOrNull(payload.lead),
    description: toStringOrNull(payload.description),
    date: toStringOrNull(payload.date),
    category: toStringOrNull(payload.category),
    contentMdx,
    sourceHash: toStringOrNull(payload.sourceHash),
    author,
    publishedAt: toStringOrNull(payload.publishedAt),
  };
}

export function mapCmsIssue(entity: unknown): CmsIssue | null {
  const payload = unwrapEntity(entity);
  if (!payload) return null;

  const id = toNumber(payload.id);
  const year = toNumber(payload.year);
  const title = toStringOrNull(payload.title);

  if (id === null || year === null || !title) return null;

  const fileUrl = mediaUrlFromField(payload.file);
  const coverUrl = mediaUrlFromField(payload.cover);

  return {
    id,
    year,
    title,
    fileUrl,
    coverUrl,
    publishedAt: toStringOrNull(payload.publishedAt),
  };
}

export function cmsAuthorToAuthorRow(author: CmsAuthor): AuthorRow {
  return {
    id: String(author.id),
    legacyId: author.legacyId ?? undefined,
    slug: author.slug,
    name: author.name,
    displayName: author.displayName,
    img: author.avatarUrl || author.legacyImgPath,
    bio: author.bio,
    sourceHash: author.sourceHash ?? undefined,
  };
}

export function cmsAuthorToAuthorDetail(author: CmsAuthor, analyses: CmsAnalysis[]): AuthorDetail {
  return {
    author: {
      id: String(author.id),
      legacyId: author.legacyId ?? undefined,
      slug: author.slug,
      name: author.name,
      displayName: author.displayName,
      img: author.avatarUrl || author.legacyImgPath,
      bio: author.bio,
      sourceHash: author.sourceHash ?? undefined,
    },
    analyses: analyses.map((analysis) => ({
      id: String(analysis.id),
      title: analysis.title,
      slug: analysis.slug,
      authorId: String(analysis.author?.id ?? author.id),
      publishedAt: toIsoDateOrEmpty(analysis.publishedAt ?? analysis.date ?? undefined),
      excerpt: createExcerpt(
        (analysis.lead && analysis.lead.trim()) ||
          (analysis.description && analysis.description.trim()) ||
          stripMdxFrontmatter(analysis.contentMdx || "") ||
          analysis.title,
        220,
      ),
      bodyText: stripMarkdown(stripMdxFrontmatter(analysis.contentMdx || "")).trim(),
      isPublished: Boolean(analysis.publishedAt ?? analysis.date),
      date: analysis.date ?? undefined,
      lead: analysis.lead ?? undefined,
      description: analysis.description ?? undefined,
      category: analysis.category ?? undefined,
      sourceHash: analysis.sourceHash ?? undefined,
    })),
  };
}

export function cmsAnalysisToAnalysisRow(analysis: CmsAnalysis): AnalysisRow {
  const normalizedContent = stripMdxFrontmatter(analysis.contentMdx || "");
  const bodyText = stripMarkdown(normalizedContent);
  const excerptSource =
    (analysis.lead && analysis.lead.trim()) ||
    (analysis.description && analysis.description.trim()) ||
    normalizedContent ||
    analysis.title;

  return {
    id: String(analysis.id),
    title: analysis.title,
    slug: analysis.slug,
    authorId: String(analysis.author?.id ?? ""),
    publishedAt: toIsoDateOrEmpty(analysis.publishedAt ?? analysis.date ?? undefined),
    excerpt: createExcerpt(excerptSource, 220),
    bodyText,
    isPublished: Boolean(analysis.publishedAt ?? analysis.date),
    date: analysis.date ?? undefined,
    lead: analysis.lead ?? undefined,
    description: analysis.description ?? undefined,
    category: analysis.category ?? undefined,
    sourceHash: analysis.sourceHash ?? undefined,
    author: analysis.author
      ? {
          id: String(analysis.author.id),
          slug: analysis.author.slug,
          name: analysis.author.name,
          img: analysis.author.avatarUrl || analysis.author.legacyImgPath,
        }
      : undefined,
  };
}

export function cmsAnalysisToAnalysisDetail(analysis: CmsAnalysis): AnalysisDetail {
  return {
    id: String(analysis.id),
    title: analysis.title,
    slug: analysis.slug,
    date: analysis.date ?? undefined,
    lead: analysis.lead ?? undefined,
    description: analysis.description ?? undefined,
    category: analysis.category ?? undefined,
    contentMdx: analysis.contentMdx,
    sourceHash: analysis.sourceHash ?? undefined,
    author: analysis.author
      ? {
          id: String(analysis.author.id),
          slug: analysis.author.slug,
          name: analysis.author.name,
          img: analysis.author.avatarUrl || analysis.author.legacyImgPath,
          bio: analysis.author.bio ?? undefined,
        }
      : undefined,
  };
}

export function cmsIssueToIssueCollectionRow(issue: CmsIssue): IssueCollectionRow {
  return {
    id: String(issue.id),
    year: issue.year,
    title: issue.title,
    file: issue.fileUrl || "#",
    cover: issue.coverUrl,
  };
}
