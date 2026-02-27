import type { Metadata } from "next";
import { getAuthors } from "@/lib/authors";
import { AuthorRow } from "@/types/author";
import Hero from "@/components/Hero";
import AuthorsClient from "./AuthorsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Force dynamic rendering - always fresh data

export const metadata: Metadata = {
  title: "Nasi autorzy - Centrum Analiz Służby Niepodległej",
  description:
    "Poznaj autorów Centrum Analiz Służby Niepodległej i ich publikacje poświęcone sprawom państwa, społeczeństwa i gospodarki.",
  alternates: {
    canonical: "https://casn.pl/autorzy",
  },
  openGraph: {
    title: "Nasi autorzy - Centrum Analiz Służby Niepodległej",
    description:
      "Poznaj autorów Centrum Analiz Służby Niepodległej i ich publikacje poświęcone sprawom państwa, społeczeństwa i gospodarki.",
    type: "website",
    url: "https://casn.pl/autorzy",
    siteName: "Centrum Analiz Służby Niepodległej",
    images: "/images/home2.webp",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nasi autorzy - Centrum Analiz Służby Niepodległej",
    description:
      "Poznaj autorów Centrum Analiz Służby Niepodległej i ich publikacje poświęcone sprawom państwa, społeczeństwa i gospodarki.",
    images: ["/images/home2.webp"],
  },
};

export default async function AuthorsPage() {
  // Always try to load authors, but handle errors gracefully
  let authors: AuthorRow[] = [];
  try {
    authors = await getAuthors();
    console.log('[AUTORZY] Fetched authors:', authors.length, 'items');
  } catch (error) {
    console.warn('Failed to load authors:', error);
    // Return empty array as fallback
  }

  return (
    <main className="bg-gray-100 min-h-screen pb-12">
      {/* Global Hero */}
      <Hero
        title="Nasi autorzy"
        breadcrumbs={[
          { label: "Strona główna", href: "/" },
          { label: "Nasi autorzy", active: true },
        ]}
      />

      {/* LISTA AUTORÓW */}
      <AuthorsClient authors={authors} />
    </main>
  );
}
