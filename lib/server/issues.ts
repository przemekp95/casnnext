import "server-only";

import { fetchCmsIssues } from "@/lib/cms/strapi-client";
import { cmsIssueToIssueCollectionRow } from "@/lib/cms/mappers";
import { isStrapiProvider } from "@/lib/content-provider";
import type { IssueCollectionRow } from "@/types/issue";

const fallbackIssues: IssueCollectionRow[] = [
  { id: "2025", year: 2025, file: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf", title: "Zeszyt Analiz 2025" },
  { id: "2024", year: 2024, file: "/Katalog CASN_online_08_12_24.pdf", title: "Zeszyt Analiz 2024" },
  { id: "2023", year: 2023, file: "/Analizy_2023.pdf", title: "Zeszyt Analiz 2023" },
  { id: "2022", year: 2022, file: "/CASN_gotowa_wersja_do_druku_24.01.2023.pdf", title: "Zeszyt Analiz 2022" },
];

export async function getIssueCollections(): Promise<IssueCollectionRow[]> {
  if (!isStrapiProvider()) {
    return fallbackIssues;
  }

  try {
    const issues = await fetchCmsIssues();
    if (issues.length === 0) return fallbackIssues;

    return issues.map(cmsIssueToIssueCollectionRow);
  } catch (error) {
    console.warn("Failed to fetch issue collections from Strapi, using fallback:", error);
    return fallbackIssues;
  }
}

