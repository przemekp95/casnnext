import type { AnalysisDetail, AnalysisRow } from "@/types/analysis";
import type { AuthorDetail, AuthorRow } from "@/types/author";
import type { IssueCollectionRow } from "@/types/issue";
import { getStrapiPublicUrl } from "./config";
import type { CmsAnalysis, CmsAuthor, CmsIssue } from "./types";

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

  return {
    id,
    legacyId,
    slug,
    name,
    displayName,
    bio,
    avatarUrl,
    legacyImgPath,
    sourceHash,
  };
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
    })),
  };
}

export function cmsAnalysisToAnalysisRow(analysis: CmsAnalysis): AnalysisRow {
  return {
    id: String(analysis.id),
    title: analysis.title,
    slug: analysis.slug,
    authorId: String(analysis.author?.id ?? ""),
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
