import "server-only";

import { unstable_cache } from "next/cache";
import { executeRscQuery } from "@/lib/db.rsc";
import { IssueCollectionSchema } from "@/lib/entities";
import type { IssueCollectionRow } from "@/types/issue";
import { IsNull, Not } from "typeorm";

const fallbackIssues: IssueCollectionRow[] = [
  { id: "2025", year: 2025, file: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf", title: "Zeszyt Analiz 2025" },
  { id: "2024", year: 2024, file: "/Katalog%20CASN_online_08_12_24.pdf", title: "Zeszyt Analiz 2024" },
  { id: "2023", year: 2023, file: "/Analizy_2023.pdf", title: "Zeszyt Analiz 2023" },
  { id: "2022", year: 2022, file: "/CASN_gotowa_wersja_do_druku_24.01.2023.pdf", title: "Zeszyt Analiz 2022" },
];

function normalizeIssueFileUrl(fileUrl: string): string {
  if (!fileUrl.includes(" ")) return fileUrl;
  return fileUrl.replace(/ /g, "%20");
}

async function getIssueCollectionsUncached(): Promise<IssueCollectionRow[]> {
  try {
    return await executeRscQuery(async (dataSource) => {
      const repository = dataSource.getRepository(IssueCollectionSchema);
      const issues = await repository.find({
        where: {
          publishedAt: Not(IsNull()),
        },
        order: { year: "DESC" },
      });

      if (issues.length === 0) {
        return fallbackIssues.map((issue) => ({
          ...issue,
          file: normalizeIssueFileUrl(issue.file),
        }));
      }

      return issues
        .filter((issue) => issue.fileUrl.trim().length > 0 && issue.fileUrl !== "#")
        .map((issue) => ({
          id: String(issue.id),
          year: issue.year,
          title: issue.title,
          file: normalizeIssueFileUrl(issue.fileUrl),
          cover: issue.coverUrl ?? null,
        }));
    });
  } catch (error) {
    console.warn("Failed to fetch issue collections from the database, using fallback:", error);
    return fallbackIssues.map((issue) => ({
      ...issue,
      file: normalizeIssueFileUrl(issue.file),
    }));
  }
}

const getIssueCollectionsCached =
  typeof unstable_cache === "function"
    ? unstable_cache(getIssueCollectionsUncached, ["issues:list"], {
        tags: ["issues"],
      })
    : getIssueCollectionsUncached;

export async function getIssueCollections(): Promise<IssueCollectionRow[]> {
  if (process.env.NODE_ENV === "test") {
    return getIssueCollectionsUncached();
  }

  return getIssueCollectionsCached();
}
