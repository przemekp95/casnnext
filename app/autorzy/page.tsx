import type { Metadata } from "next";
import { loadAuthors } from "@/lib/server/authors.loader";
import { AuthorRow } from "@/types/author";
import Hero from "@/components/Hero";
import AuthorsClient from "./AuthorsClient";

export const runtime = "nodejs";
export const revalidate = 3600; // ISR - odśwież co godzinę

export const metadata: Metadata = { title: "Nasi autorzy - Centrum Analiz Służby Niepodległej" };

export default async function AuthorsPage() {
  // Always try to load authors, but handle errors gracefully
  let authors: AuthorRow[] = [];
  try {
    authors = await loadAuthors();
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