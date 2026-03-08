import crypto from "crypto";
import matter from "gray-matter";
import { IsNull, Not } from "typeorm";
import { AppDataSource } from "../../lib/db.shared";
import {
  fetchCmsAnalyses,
  fetchCmsAuthors,
  fetchCmsIssues,
} from "../../lib/cms/strapi-client";
import type { CmsAnalysis, CmsAuthor, CmsIssue } from "../../lib/cms/types";
import {
  AnalysisSchema,
  AuthorSchema,
  IssueCollectionSchema,
} from "../../lib/entities";
import type { AnalysisEntity } from "../../lib/entities/Analysis";
import type { AuthorEntity } from "../../lib/entities/Author";
import type { IssueCollectionEntity } from "../../lib/entities/IssueCollection";

type Finding = {
  kind: "author" | "analysis" | "issue";
  ref: string;
  field?: string;
  message: string;
  expected?: string | null;
  actual?: string | null;
};

type VerificationSummary = {
  strapi: {
    authors: number;
    analyses: number;
    issues: number;
  };
  db: {
    authors: number;
    analyses: number;
    issues: number;
  };
  findings: number;
};

function hashObject(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
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

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : "";
}

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = toNullableString(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
}

function toTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const normalized = new Date(value);
    normalized.setMilliseconds(0);
    return normalized.toISOString();
  }

  const text = toNullableString(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  parsed.setMilliseconds(0);
  return parsed.toISOString();
}

function authorImage(author: CmsAuthor): string | null {
  return author.avatarUrl || author.legacyImgPath || null;
}

function authorSourceHash(author: CmsAuthor): string {
  return (
    author.sourceHash ??
    hashObject({
      slug: author.slug,
      name: author.name,
      displayName: author.displayName,
      bio: author.bio,
      img: authorImage(author),
    })
  );
}

function issueSourceHash(issue: CmsIssue): string {
  return hashObject({
    year: issue.year,
    title: issue.title,
    fileUrl: issue.fileUrl,
    coverUrl: issue.coverUrl,
  });
}

function analysisSourceHash(analysis: CmsAnalysis, authorId: number, contentMdx: string): string {
  return (
    analysis.sourceHash ??
    hashObject({
      slug: analysis.slug,
      title: analysis.title,
      authorId,
      lead: analysis.lead,
      description: analysis.description,
      date: analysis.date,
      category: analysis.category,
      contentMdx,
    })
  );
}

function addFieldFinding(
  findings: Finding[],
  kind: Finding["kind"],
  ref: string,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  const expectedText = toNullableString(expected);
  const actualText = toNullableString(actual);
  if (expectedText === actualText) return;

  findings.push({
    kind,
    ref,
    field,
    message: `${kind} ${ref} has mismatched ${field}`,
    expected: expectedText,
    actual: actualText,
  });
}

function addContentFinding(
  findings: Finding[],
  ref: string,
  expected: string,
  actual: string | null,
): void {
  if (expected === (actual ?? null)) return;

  findings.push({
    kind: "analysis",
    ref,
    field: "contentMdx",
    message: `analysis ${ref} has mismatched contentMdx`,
    expected: `sha256:${hashObject(expected)}`,
    actual: actual === null ? null : `sha256:${hashObject(actual)}`,
  });
}

async function resolveAnalysisAuthor(
  analysis: CmsAnalysis,
  authorsBySlug: Map<string, CmsAuthor>,
): Promise<CmsAuthor | null> {
  if (analysis.author) {
    return analysis.author;
  }

  if (!AppDataSource?.isInitialized) {
    throw new Error("Database is not initialized");
  }

  const rows = await AppDataSource.query(
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
    [analysis.id],
  );

  const slug = typeof rows?.[0]?.slug === "string" ? rows[0].slug : null;
  return slug ? authorsBySlug.get(slug) ?? null : null;
}

function formatFinding(finding: Finding): string {
  const fieldPart = finding.field ? ` [${finding.field}]` : "";
  const expectedPart =
    finding.expected !== undefined ? ` expected=${JSON.stringify(finding.expected)}` : "";
  const actualPart =
    finding.actual !== undefined ? ` actual=${JSON.stringify(finding.actual)}` : "";
  return `- ${finding.kind}:${finding.ref}${fieldPart} ${finding.message}${expectedPart}${actualPart}`;
}

async function run() {
  if (!AppDataSource) {
    throw new Error("Database is not configured");
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    const [cmsAuthors, cmsAnalyses, cmsIssues] = await Promise.all([
      fetchCmsAuthors(),
      fetchCmsAnalyses(),
      fetchCmsIssues(),
    ]);

    const authorRepository = AppDataSource.getRepository(AuthorSchema);
    const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
    const issueRepository = AppDataSource.getRepository(IssueCollectionSchema);

    const [dbAuthors, dbAnalyses, dbIssues] = await Promise.all([
      authorRepository.find({
        where: {
          strapiId: Not(IsNull()),
          publishedAt: Not(IsNull()),
        },
      }) as Promise<AuthorEntity[]>,
      analysisRepository.find({
        where: {
          strapiId: Not(IsNull()),
          publishedAt: Not(IsNull()),
        },
      }) as Promise<AnalysisEntity[]>,
      issueRepository.find({
        where: {
          strapiId: Not(IsNull()),
          publishedAt: Not(IsNull()),
        },
      }) as Promise<IssueCollectionEntity[]>,
    ]);

    const findings: Finding[] = [];

    const dbAuthorsByStrapiId = new Map(dbAuthors.map((row) => [row.strapiId as number, row]));
    const dbAnalysesByStrapiId = new Map(dbAnalyses.map((row) => [row.strapiId as number, row]));
    const dbIssuesByStrapiId = new Map(dbIssues.map((row) => [row.strapiId as number, row]));
    const dbAuthorsBySlug = new Map(dbAuthors.map((row) => [row.slug, row]));
    const cmsAuthorsBySlug = new Map(cmsAuthors.map((row) => [row.slug, row]));

    for (const cmsAuthor of cmsAuthors) {
      const dbAuthor = dbAuthorsByStrapiId.get(cmsAuthor.id);
      const ref = cmsAuthor.slug;

      if (!dbAuthor) {
        findings.push({
          kind: "author",
          ref,
          message: `author ${ref} is published in Strapi but missing from DB read model`,
        });
        continue;
      }

      addFieldFinding(findings, "author", ref, "slug", cmsAuthor.slug, dbAuthor.slug);
      addFieldFinding(findings, "author", ref, "name", cmsAuthor.name, dbAuthor.name);
      addFieldFinding(
        findings,
        "author",
        ref,
        "displayName",
        cmsAuthor.displayName || cmsAuthor.name,
        dbAuthor.displayName,
      );
      addFieldFinding(findings, "author", ref, "img", authorImage(cmsAuthor), dbAuthor.img ?? null);
      addFieldFinding(findings, "author", ref, "bio", cmsAuthor.bio ?? null, dbAuthor.bio ?? null);
      addFieldFinding(
        findings,
        "author",
        ref,
        "sourceHash",
        authorSourceHash(cmsAuthor),
        dbAuthor.sourceHash ?? null,
      );
      addFieldFinding(
        findings,
        "author",
        ref,
        "publishedAt",
        toTimestamp(cmsAuthor.publishedAt),
        toTimestamp(dbAuthor.publishedAt),
      );
    }

    for (const cmsAnalysis of cmsAnalyses) {
      const dbAnalysis = dbAnalysesByStrapiId.get(cmsAnalysis.id);
      const ref = cmsAnalysis.slug;

      if (!dbAnalysis) {
        findings.push({
          kind: "analysis",
          ref,
          message: `analysis ${ref} is published in Strapi but missing from DB read model`,
        });
        continue;
      }

      const resolvedAuthor = await resolveAnalysisAuthor(cmsAnalysis, cmsAuthorsBySlug);
      if (!resolvedAuthor) {
        findings.push({
          kind: "analysis",
          ref,
          field: "author",
          message: `analysis ${ref} has no resolvable author in Strapi`,
        });
        continue;
      }

      const expectedAuthor = dbAuthorsByStrapiId.get(resolvedAuthor.id) ?? dbAuthorsBySlug.get(resolvedAuthor.slug);
      if (!expectedAuthor) {
        findings.push({
          kind: "analysis",
          ref,
          field: "authorId",
          message: `analysis ${ref} points to author ${resolvedAuthor.slug} that is missing in DB`,
        });
        continue;
      }

      const storedContent = buildStoredAnalysisContent(cmsAnalysis);

      addFieldFinding(findings, "analysis", ref, "title", cmsAnalysis.title, dbAnalysis.title);
      addFieldFinding(findings, "analysis", ref, "slug", cmsAnalysis.slug, dbAnalysis.slug);
      addFieldFinding(findings, "analysis", ref, "authorId", expectedAuthor.id, dbAnalysis.authorId);
      addFieldFinding(findings, "analysis", ref, "lead", cmsAnalysis.lead ?? null, dbAnalysis.lead ?? null);
      addFieldFinding(
        findings,
        "analysis",
        ref,
        "description",
        cmsAnalysis.description ?? null,
        dbAnalysis.description ?? null,
      );
      addFieldFinding(findings, "analysis", ref, "date", toDateOnly(cmsAnalysis.date), toDateOnly(dbAnalysis.date));
      addFieldFinding(
        findings,
        "analysis",
        ref,
        "category",
        cmsAnalysis.category ?? null,
        dbAnalysis.category ?? null,
      );
      addContentFinding(findings, ref, storedContent, dbAnalysis.contentMdx ?? null);
      addFieldFinding(
        findings,
        "analysis",
        ref,
        "sourceHash",
        analysisSourceHash(cmsAnalysis, expectedAuthor.id, storedContent),
        dbAnalysis.sourceHash ?? null,
      );
      addFieldFinding(
        findings,
        "analysis",
        ref,
        "publishedAt",
        toTimestamp(cmsAnalysis.publishedAt),
        toTimestamp(dbAnalysis.publishedAt),
      );
    }

    for (const cmsIssue of cmsIssues) {
      const dbIssue = dbIssuesByStrapiId.get(cmsIssue.id);
      const ref = String(cmsIssue.year);

      if (!dbIssue) {
        findings.push({
          kind: "issue",
          ref,
          message: `issue ${ref} is published in Strapi but missing from DB read model`,
        });
        continue;
      }

      addFieldFinding(findings, "issue", ref, "year", cmsIssue.year, dbIssue.year);
      addFieldFinding(findings, "issue", ref, "title", cmsIssue.title, dbIssue.title);
      addFieldFinding(findings, "issue", ref, "fileUrl", cmsIssue.fileUrl || "#", dbIssue.fileUrl);
      addFieldFinding(findings, "issue", ref, "coverUrl", cmsIssue.coverUrl ?? null, dbIssue.coverUrl ?? null);
      addFieldFinding(
        findings,
        "issue",
        ref,
        "sourceHash",
        issueSourceHash(cmsIssue),
        dbIssue.sourceHash ?? null,
      );
      addFieldFinding(
        findings,
        "issue",
        ref,
        "publishedAt",
        toTimestamp(cmsIssue.publishedAt),
        toTimestamp(dbIssue.publishedAt),
      );
    }

    const publishedCmsAuthorIds = new Set(cmsAuthors.map((row) => row.id));
    for (const dbAuthor of dbAuthors) {
      if (!publishedCmsAuthorIds.has(dbAuthor.strapiId as number)) {
        findings.push({
          kind: "author",
          ref: dbAuthor.slug,
          message: `author ${dbAuthor.slug} is still published in DB but no longer published in Strapi`,
        });
      }
    }

    const publishedCmsAnalysisIds = new Set(cmsAnalyses.map((row) => row.id));
    for (const dbAnalysis of dbAnalyses) {
      if (!publishedCmsAnalysisIds.has(dbAnalysis.strapiId as number)) {
        findings.push({
          kind: "analysis",
          ref: dbAnalysis.slug,
          message: `analysis ${dbAnalysis.slug} is still published in DB but no longer published in Strapi`,
        });
      }
    }

    const publishedCmsIssueIds = new Set(cmsIssues.map((row) => row.id));
    for (const dbIssue of dbIssues) {
      if (!publishedCmsIssueIds.has(dbIssue.strapiId as number)) {
        findings.push({
          kind: "issue",
          ref: String(dbIssue.year),
          message: `issue ${dbIssue.year} is still published in DB but no longer published in Strapi`,
        });
      }
    }

    const summary: VerificationSummary = {
      strapi: {
        authors: cmsAuthors.length,
        analyses: cmsAnalyses.length,
        issues: cmsIssues.length,
      },
      db: {
        authors: dbAuthors.length,
        analyses: dbAnalyses.length,
        issues: dbIssues.length,
      },
      findings: findings.length,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (findings.length > 0) {
      console.error("Strapi -> DB parity mismatches:");
      for (const finding of findings.slice(0, 50)) {
        console.error(formatFinding(finding));
      }
      if (findings.length > 50) {
        console.error(`...and ${findings.length - 50} more`);
      }
      throw new Error(`Strapi -> DB parity failed with ${findings.length} finding(s)`);
    }

    console.log("Strapi -> DB parity verification succeeded.");
  } finally {
    if (AppDataSource?.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error) => {
  console.error("Parity verification failed:", error);
  process.exit(1);
});
